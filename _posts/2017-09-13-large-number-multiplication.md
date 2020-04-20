---
layout: post
title:  "Large Number Multiplication"
date:   2017-09-13 10:35:00 -0700
categories: story
---

This is a remembrance of a programming project in my childhood where I
tried to provide a natural C++ API for arithmetic on the GPU to compute
large numeric constants.

GitHub: https://github.com/eyepatchParrot/BigNumHistory

It starts with using Newton's method to calculate square roots and
applying it to a double only to find that after some number of digits,
you just can't seem to do any better. That's when I began to understand
how floating point numbers worked, and why I needed more precision.

So, I began building more precision. I took the operations that are
involved in Newton's method: multiplication, shifting, and subtraction,
and I began work on a 32.X arithmetic library. 32.X because 32-bits
to represent the integral portion and an arbitrary number of digits in
the fractional portion. One of my additional goals from the start was
to create an abstraction of arbitrary precision that was strong enough
that with operator overloading, the arbitrary precision would behave
like a native type.

This project was my first exposure to writing proofs, asymptotic analysis,
and debugging of complex systems. I initially implemented multiplication
using the 'peasant' multiplication algorithm which for each bit, does a
shift and an addition. I did this because addition increases place value
by at most one place, and that simplifies the output while grade-school
multiplication can double the number of places which requires keeping
track of which numbers to multiply together. After peasant multiplication,
I went to the effort of implementing grade-school multiplication and
was amazed at the difference that the different algorithms could make.

Since I had decided on a 32.X format, and Karatsuba's Algorithm as stated
on Wikipedia is for whole integers, I re-derived the algorithm to include
the integral and fractional component.  After my CUDA C experience with
random numbers, I decided to use OpenCL for the base case multiplication
on my GPU in hopes of better debugging ability and the ability to use
both my GPUs which were different brands. One of the challenges of working
with GPUs is that there are very strong limitations of what can be shared
across threads. This lead me to an algorithm where instead of propogating
the carry for each multiplication, instead, for two input numbers, they
would output a number that was the multiplication of the two and the
carry portion. This allows the carry portion to then be added in parallel.

OpenCL ended up being worse than CUDA 4 for debugging ability, so I
re-wrote the program to use CUDA C. One of my major issues was testing
my multiplication implementations. Since I was running the base cases
on the GPU at that point in the development of CUDA C, there existed no
ability to output messages. When I tried having a space for threads to
output error codes, I had some difficulty with race conditions on the
error codes themselves. From there, I realized that I needed an array
of error code slots, one for each thread so that nothing was overwritten.

I experimented with implementing arbitrary precision arithmetic as a
Deque, integrating exceptions and using unit testing, but ultimately I
ended up with a very similar solution to what I began with. The difference
was that instead of maintaining a 32.X format which makes multiplication
manipulation tricky and unreadable, instead I used extremely large
integers that have an implicit place value shift.

I also taught myself basic linear algebra so that I could implement
Toom-3, an asymptotically better algorithm. I learned the difference
that complexity makes, the development cost of microoptimizations and how
the performance benefit can be wiped out by changing algorithm demanding
re-writes. I learned to write code for humans first because my ability
to read code often made a bigger difference in the long-term execution
time. I learned to validate my results with graphs and proofs, and this
project represented the flourishing of my maturity as a programmer.
