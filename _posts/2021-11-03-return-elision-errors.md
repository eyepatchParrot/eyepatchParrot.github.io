# Return Elision Errors
<!---
---
layout: post
title:  "Return Elision Errors"
date:   2021-11-03 02:39:00 -0700
categories: experiment
---
-->

A sketch of errors which support no-move no-copy types by inverting the function return flow. Encapsulated into a future-like interface for clarity.

This goes down a whole rabbit hole of converting between different error types automatically, which unfortunately distracts from the error handling.
Everything interesting happens in ResultT and BindFirst. I seem to remember this being adaptable to having multiple output streams like a sort of `tee`. Hopefully, I can re-find that example.

https://gcc.godbolt.org/z/YacxPesfM

```c++
#include <sstream>
#include <optional>
#include <variant>
#include <functional>

struct Error {
    int line;
    Error() : line(0) {}
    Error(int l) : line(l) {}
    bool ok() { return !line; }
};
#define ERROR Error{__LINE__}

template <class CallableT, class BoundT> struct BoundCallable {
    CallableT Callable; BoundT Bound;
    BoundCallable(CallableT Callable, BoundT Bound) : Callable(Callable), Bound(Bound) {}
    template <class... ArgsT> auto operator()(ArgsT&&... Args) {
        return Callable(Bound, std::forward<ArgsT>(Args)...);
    }
};
template <class T, class U> auto BindFirst(T t, U u) {
    return BoundCallable<decltype(t), decltype(u)>(t, u);
}

template <class T> struct ResultT {
    T t;
    template <class U> auto Then(U u) {
        auto rv = [=](auto&& yield) {
            return t(BindFirst(u, yield));
        };
        return ResultT<decltype(rv)>{rv};
    }
    template <class U, class... Vs> auto Force(U& out, Vs&&... vs) {
        auto o = [&](const auto& u) { out=u; return Error{}; };
        return t(o)(std::forward<Vs>(vs)...);
    }
};

template <class T> auto ResultRaw(T t) {
    return ResultT<T>{t};
}

template <class T> auto Result(T t) {
    // Start by currying the first argument.
    return ResultRaw([=](auto&& yield) { return BindFirst(t, yield); });
}

template <typename U, typename T> auto OutParam(T t) {
    return [=](auto&& yield, auto&&... args) {
        U out;
        Error err = t(args..., out);
        return err.ok() ? err : yield(out);
    };
}

template <typename T> auto ErrorOut(T t) {
    return [=](auto&& yield, auto&&... args) {
        Error err;
        auto out = t(args..., err);
        return !out ? err : yield(*out);
    };
}

#ifdef CPP_17
template <typename T> auto ResultError(T t) {
    return [=](auto&& yield, auto&&... args) {
        auto result = t(args...);
        return std::holds_alternative<Error>(result) ? std::get<Error>(result) : yield(std::get<1>(result));
    };
}
#endif

template <typename T> auto Exception(T t) {
    return [=](auto&& yield, auto&&... args) {
        try {
            return yield(t(args...));
        } catch (Error& ex) {
            return ex;
        }
    };
}

Error SameOrDefault(const char * s, const char * def, const char *& out) {
    if (s) {
        out = s;
        return Error{};
    }
    if (def) {
        out = def;
        return Error{};
    }
    return ERROR;
}

#ifdef CPP_17
std::variant<Error, int> ParseInt(const char * s) {
    if (!s || *s < '0' || *s > '9') return ERROR;
    return int(*s - '0');
}

std::optional<int> DivideLifeBy(int div, Error& err) {
    if (!div) {
        err = ERROR;
        return std::nullopt;
    }
    return 42/div;
}
#endif

int Sqrt(int value) {
    if (value < 0) throw ERROR;
    for (int i = 0;; i++) {
        if ((i+1)*(i+1)> value) return i;
    }
}

struct S {
    int x;
    auto operator=(int y) { x=y; }
};

auto f(const char * s) {
    S Out{0};
    return Result(OutParam<const char *>(SameOrDefault))
        .Then(ResultError(ParseInt))
        .Then(ErrorOut(DivideLifeBy))
        .Then(Exception(Sqrt))
        .Force(Out, "abc", nullptr).ok();
}

struct NoMove {
    NoMove() {}
    NoMove(const NoMove&) = delete;
    NoMove(NoMove&&) = delete;
    NoMove& operator=(const NoMove&) = delete;
    NoMove& operator=(NoMove&&) = delete;
};

auto no_move() {
    int out = 0;
    return Result([](auto&& yield, NoMove&& x) { return yield(std::move(x)); })
        .Then([](auto&& yield, NoMove&& x) { return yield(std::move(x)); })
        .Then([](auto&& yield, NoMove&& x) { return yield(1); })
        .Force(out, NoMove{}).ok();
}

/*
Special case for ERROR f(IN, OUT&); optional<OUT> f(IN, ERROR&); result<OUT, ERROR> f(IN);
*/
```
