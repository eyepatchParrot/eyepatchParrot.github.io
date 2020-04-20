---
layout: post
title:  "Simulations with Pseudo-Random Number Generators"
date:   2017-09-13 10:35:10 -0700
categories: story
---

This is a remembrance of a programming project in my childhood where I
tried to use parallelism to make an simulation yield improbable poker
hands.

My biology textbook likened the probability of the random formation of
a protein to drawing seventeen sequential royal flushes. Since computers
are quite fast, I decided to write a program that would deal cards very
quickly, and see how many sequential royal flushes I could achieve in
a reasonable amount of time. Since I didn't have any techniques for
estimating the outcome of the task, I moved ahead with implementation.

My first simulation was in C++, and it used stdrand to generate
random numbers that were then used to simulate the draw of a single
card. The standard library RNG has a couple of issues that affected my
non-scientific program: first, it has global state; second, it has a
period of 2^32, so I would rather quickly begin to no longer be working
with unique number sequences; second, it was too slow.

The next speed increase came from experimentation with Boost pseudo-random
number generators. The fastest ones that I encountered were one of the
mersenne-twisters and a hybrid generator: tausworthe 88. Since each
thread would have its own random number generator in order to avoid
sharing state, I couldn't use the mersenne-twister because it requires a
lot of state, while tausworthe was both compact and simple to implement
which came in handy later. Tausworthe also has a period of 2^88, which
is plenty large enough for my purposes.

The next phase of the project centered around parallelism. I did try
using pthreads, where I seeded each thread's PRNG with a the result of a
global PRNG, but game-changing improvement was when I involved my nVidia
Geforce 460 to use CUDA C to run the simulation on tens of thousands of
threads instead of 3-7. This improved the throughput of the simulation
by one or two orders of magnitude.

The major issue with this approach, however, is the branching factor
that was a part of my simulation design. One of the things that I would
change about this project if I were to do it again would be to generate a
sequence that represents the drawing of an entire hand of cards instead
of doing it one card at a time. I also have some ideas on how to avoid
the very painful branching that destroyed my parallel performance.

I also didn't do a basic analysis of scale like I would now. I could come
within an order of magnitude by taking a rough estimation. A random number
would require at least five instructions, and a draw requires at least
5 random numbers plus a few branching instructions, so generating a deal
would require at least 35 instructions. If we assume that an instruction
takes 1ns, then we can say that we would expect to be within a couple
orders of magnitude of 29 million deals per second. The GPU might add up
to two orders of magnitude in performance, so around 2.9 billion deals
per second. Since the odds of getting a royal flush are 1/649,740,
the odds of getting two are 1 in 422 billion. So we would expect that
with a GPU, it would take 145 seconds for a GPU to randomly generate
a sequence that satisfies. There are some improvements to be made, but
these estimations line up reasonably closely with my numbers. In fact,
one of the ways that I verified my simulation was by comparing the
results to the statistical expectation.

All of this started with biology, and became increasingly about random
numbers. This peaked when I decided that for my second 650x project
to showcase at a vintage computer conference, I would generate a
pseudorandom number generating benchmark for a Commodore computer. This
involved re-writing the tausworthe generator into 650X ASM. One of the
major challenges of this was that I had been working with 32-bits, and
my new processor was an 8-bit processor. While I was still generating
32-bit random numbers, I had to do so in several steps, and I decided to
simplify the constants used by reading a paper on appropriate constants
at varying sizes.
