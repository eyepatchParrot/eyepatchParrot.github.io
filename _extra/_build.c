#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/wait.h>
#include <errno.h>
#include <string.h>
#define STRINGIFY(x) #x
#define STR(x) STRINGIFY(x)

typedef char const * Str;
typedef struct Cmd {
    Str *args;
} Cmd;
typedef struct Pipe {
    size_t len;
    Cmd *cmds;
} Pipe;


#define LEN(x) (sizeof(x)/sizeof(x[0]))

typedef struct Error {
    char const * message;
    char const * file;
    char const * function;
    char const * line;
} Error;

void maybe_fail(int b, Error e) {
    if (!b) return;
    fputs(e.file, stderr);
    fputs(e.line, stderr);
    fputs(":0 (", stderr);
    fputs(e.function, stderr);
    fputs(") ", stderr);
    perror(e.message);
    exit(1);
}

void fail(Error e) {
    maybe_fail(1, e);
}

#define FAIL_REASON(reason) (struct Error){ reason, __FILE__ ":", __FUNCTION__, STR(__LINE__) }
#define FAIL(reason) fail(FAIL_REASON(reason))
#define FAIL_FORK FAIL("Fork failed")
#define FAIL_EXEC FAIL("Exec failed")
#define FATAL_UNLESS(x) maybe_fail(!(x), FAIL_REASON(#x))
#define FATAL_IF(x) maybe_fail(!!(x), FAIL_REASON(#x))

typedef struct FixedString {
    size_t len;
    char buf[256];
} FixedString;

FixedString read_all(int fd) {
    FixedString rv;
    rv.len = 0;
    ssize_t bytes_read;
    while (rv.len+1<sizeof(rv.buf) && (bytes_read = read(fd, rv.buf+rv.len, sizeof(rv.buf)-rv.len-1)) > 0) {
        rv.len += bytes_read;
    }
    FATAL_IF(bytes_read == -1);
    FATAL_UNLESS(rv.len<sizeof(rv.buf));
    rv.buf[rv.len] = '\0';
    return rv;
}

FixedString trim_nl(FixedString s) {
    if (s.len>=1 && s.buf[s.len-1] == '\n') {
        s.buf[s.len-1] = '\0';
        --s.len;
    }
    return s;
}

void eval(Cmd cmd) {
    char const* path = cmd.args[0];
    char* const* argv = (char* const*)cmd.args;

    pid_t pid = fork();
    if (pid < 0) {
        FAIL_FORK;
    }
    if (pid == 0) {
        execv(path, argv);
        FAIL_EXEC;
    }
    wait(NULL); // Wait for the child process to terminate
}

FixedString eval_read(Cmd cmd) {
    int read_write_fd[2];
    FATAL_UNLESS(0==pipe(read_write_fd));
    pid_t pid = fork();
    FATAL_UNLESS(pid >= 0);
    if (pid == 0) {
        FATAL_IF(dup2(read_write_fd[1], STDOUT_FILENO) == -1);
        close(read_write_fd[0]);
        close(read_write_fd[1]);
        char const* path = cmd.args[0];
        char* const* argv = (char* const*)cmd.args;
        execv(path, argv);
        FAIL_EXEC;
    }
    close(read_write_fd[1]);
    FixedString rv = read_all(read_write_fd[0]);
    close(read_write_fd[0]);
    wait(NULL); // Wait for the child process to terminate
    return rv;
}

#define CMD0(...) (struct Cmd){ .args = (Str[]){ __VA_ARGS__ , NULL} }
void pipe_all(Pipe pipeline) {
    // Validate input
    FATAL_IF(pipeline.len == 0);

    int prev_pipe[2];  // Pipe for the previous command's output
    int curr_pipe[2];  // Pipe for the current command's output

    for (size_t i = 0; i < pipeline.len; i++) {
        // Create the pipe for the current command's output
        if (i < pipeline.len - 1) {
            FATAL_IF(pipe(curr_pipe) == -1);
        }

        pid_t pid = fork();

        FATAL_IF(pid == -1);

        if (pid == 0) {
            // Child process

            // Connect stdin to the previous command's stdout (except for the first command)
            if (i > 0) {
                FATAL_IF(dup2(prev_pipe[0], STDIN_FILENO) == -1);
                close(prev_pipe[0]);
                close(prev_pipe[1]);
            }

            // Connect stdout to the current command's pipe (except for the last command)
            if (i < pipeline.len - 1) {
                FATAL_IF(dup2(curr_pipe[1], STDOUT_FILENO) == -1);
                close(curr_pipe[0]);
                close(curr_pipe[1]);
            }

            // Execute the command using execve
            _Bool has_slash = NULL != strchr(pipeline.cmds[i].args[0], '/');
            FixedString path_which;
            char const * path = pipeline.cmds[i].args[0];
            if (0 == has_slash) {
                path_which = trim_nl(eval_read(CMD0("/usr/bin/which", path)));
                path = path_which.buf;
            }
            execve(path, (char*const*)pipeline.cmds[i].args, NULL);
            perror("execve() failed");
            exit(1);
        } else {
            // Parent process

            // Close the previous pipe (except for the first command)
            if (i > 0) {
                close(prev_pipe[0]);
                close(prev_pipe[1]);
            }

            // Set the previous pipe to the current pipe (except for the last command)
            if (i < pipeline.len - 1) {
                prev_pipe[0] = curr_pipe[0];
                prev_pipe[1] = curr_pipe[1];
            }
        }
    }

    // Wait for the last child process to complete
    wait(NULL);
}



#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wsign-compare"
#include "p99/p99_for.h"
#pragma GCC diagnostic pop

#define CMD(...) (struct Cmd){ .args = (Str[]){ P99_SEQ(STRINGIFY, __VA_ARGS__) , NULL} }
#define PIPE(...) (struct Pipe){ \
    .len = sizeof((Cmd[]){ __VA_ARGS__})/sizeof(Cmd), \
    .cmds = (Cmd[]){ __VA_ARGS__}, \
}
#define CHAIN(...) pipe_all(PIPE(__VA_ARGS__))

#define SUBPROC(...) eval(CMD(__VA_ARGS__))

int main() {
    FATAL_UNLESS(0 == setenv("LC_ALL", "C", 1));
    CHAIN(
        CMD(find, _posts, -type, f),
        CMD(sort, -r),
        CMD(xargs, cat),
        CMD(tee, index.md),
        CMD(tail),
    );
}
