---
layout: post
title:  "Text Record Sorting"
date:   2017-09-13 10:34:00 -0700
categories: experiments
---

In the first project of the semester, my operating systems professor
assigned a project in C to read in a text file and to sort it by the k-th
word in each line for a particular k. Professor Remzi usually throws
in an additional twist for each project, some contest for students to
compete on. For this project, the student who wrote the fastest program
to sort and output the file would win!

GitHub: https://github.com/eyepatchParrot/wordsort/tree/archive

With my interest in performance, in-memory alpha-numeric sorts of 100B
records was an intriguing mix of simplicity and complexity.  Simple enough
to have the purity of a challenge of algorithm and implementation, yet
complex enough that the choices were numerous and the problem contained
exploitable structure.

Taking advantage of the new algorithmic paradigms and analysis that I
had learned the semester before, I did a hybrid of a bucket sort with
a qsort base case. Additionally, instead of allocating an excessively
large buffer or growing one exponentially, I chose an unrolled linked
list to store the original records separately from the keys which could
then be manipulated efficiently.

This continued to be an on-going set of experiments. Burst sort
constructs a trie on a set of strings, but optimizes the base case,
by buffering input into arrays, bursting into inner nodes only when it
reaches a threshold.

I discovered that this bursting can be delayed further if the
construction of the trie occurs both during ingest and during the
output traversal. This keeps the working set smaller during construction
because the tree is more shallow and only the tip of each buffer needs
to stay in cache. It also reduces the working set when sorting the leaves
because more of the processing of the sub-tree happens at the same time,
so other leaves don't contend for cache lines. This trie which is used
for bursting during traversal can be re-used for each sub-tree.
