---
layout: post
title:  "Base Case Sorting"
date:   2017-09-13 10:33:00 -0700
categories: experiments
---

Every great sorting algorithm needs a fast base case and with all of
the nooks and crannies to be found in modern hardware, there are as
many different implementations of a given sorting algorithm as there
are sorting algorithms, and each has its own performance characteristics.

# AVX In-Register Sorting

Inspired by a ancient Stack Overflow question I set out to experiment
with wide registers. I didn't expect to beat the existing implementations
on performance, but I was interested in the characteristic of keeping
the entire sort in a set of wide registers.

The first sorting algorithm I attempted was an insertion sort. The
version that I wrote ended up being faster than the other provided
insertion sorts, but still not the fastest algorithm. Yet, in hindsight,
I still see some serious potential for improvement.

```c++
static inline void sort6_insertion_sort_avx(int* d) {
    __m256i src = _mm256_setr_epi32(d[0], d[1], d[2], d[3], d[4], d[5], 0, 0);
    __m256i index = _mm256_setr_epi32(0, 1, 2, 3, 4, 5, 6, 7);
    __m256i shlpermute = _mm256_setr_epi32(7, 0, 1, 2, 3, 4, 5, 6);
    __m256i sorted = _mm256_setr_epi32(d[0], INT_MAX, INT_MAX, INT_MAX,
            INT_MAX, INT_MAX, INT_MAX, INT_MAX);
    __m256i val, gt, permute;
    unsigned j;
     // 8 / 32 = 2^-2
#define ITER(I) \
        val = _mm256_permutevar8x32_epi32(src, _mm256_set1_epi32(I));\
        gt =  _mm256_cmpgt_epi32(sorted, val);\
        permute =  _mm256_blendv_epi8(index, shlpermute, gt);\
        j = ffs( _mm256_movemask_epi8(gt)) >> 2;\
        sorted = _mm256_blendv_epi8(_mm256_permutevar8x32_epi32(sorted, permute),\
                val, _mm256_cmpeq_epi32(index, _mm256_set1_epi32(j)))
    ITER(1);
    ITER(2);
    ITER(3);
    ITER(4);
    ITER(5);
    int x[8];
    _mm256_storeu_si256((__m256i*)x, sorted);
    d[0] = x[0]; d[1] = x[1]; d[2] = x[2]; d[3] = x[3]; d[4] = x[4]; d[5] = x[5];
#undef ITER
```

Then, I wrote a rank order sort using AVX. This matches the speed of the
other rank-order solutions, but is no faster. The issue here is that
I can only calculate the indices with AVX, and then I have to make a
table of indices. This is because the rank order calculation yields the
destination indices for each source rather than the source index for each
destination. Converting from one to the other is an expensive operation.

```c++
static inline void sort6_rank_order_avx(int* d) {
    __m256i ror = _mm256_setr_epi32(5, 0, 1, 2, 3, 4, 6, 7);
    __m256i one = _mm256_set1_epi32(1);
    __m256i src = _mm256_setr_epi32(d[0], d[1], d[2], d[3], d[4], d[5], INT_MAX, INT_MAX);
    __m256i rot = src;
    __m256i index = _mm256_setzero_si256();
    __m256i gt, permute;
    __m256i shl = _mm256_setr_epi32(1, 2, 3, 4, 5, 6, 6, 6);
    __m256i dstIx = _mm256_setr_epi32(0,1,2,3,4,5,6,7);
    __m256i srcIx = dstIx;
    __m256i eq = one;
    __m256i rotIx = _mm256_setzero_si256();
#define INC(I)\
    rot = _mm256_permutevar8x32_epi32(rot, ror);\
    gt = _mm256_cmpgt_epi32(src, rot);\
    index = _mm256_add_epi32(index, _mm256_and_si256(gt, one));\
    index = _mm256_add_epi32(index, _mm256_and_si256(eq,\
                _mm256_cmpeq_epi32(src, rot)));\
    eq = _mm256_insert_epi32(eq, 0, I)
    INC(0);
    INC(1);
    INC(2);
    INC(3);
    INC(4);
    int e[6];
    e[0] = d[0]; e[1] = d[1]; e[2] = d[2]; e[3] = d[3]; e[4] = d[4]; e[5] = d[5];
    int i[8];
    _mm256_storeu_si256((__m256i*)i, index);
    d[i[0]] = e[0]; d[i[1]] = e[1]; d[i[2]] = e[2]; d[i[3]] = e[3]; d[i[4]] = e[4]; d[i[5]] = e[5];
}
```

# State Machines, Register Renaming, and Conditional Moves
After reading some standard library code that appeared to use a finite
state machine as a base case for its insertion sort base case, I was
interested in exploring this idea myself. Using a finite state machine in
this way is of particular interest because, like some more theoretical
algorithms, it encodes information about the data into the location,
in this case, the instruction pointer includes some information about
the particular inversion set. The example code that I had been looking
at handled 3 items I believe, but I was curious to apply it to six.

The most reasonable way that I could do this would be to compose smaller
sorts with macros. As might be expected, this did not perform well in
practice, but because the sorting algorithm was detecting the permutation,
it could copy the item directly into their targeted locations since what
was being sorted were the macro expansions. As such, this would be a
optimal for minimizing copies when the original array can't be re-used.

Peter Cordes recommends on StackOverflow: https://stackoverflow.com/a/39336981/2250147
```
You can use vmovmskps on integer vectors (with a cast to keep the
intrinsics happy), avoiding the need to right-shift the bitscan (ffs)
result.

You can conditionally add 1 based on a cmpgt result by subtracting it,
instead of masking it with set1(1). e.g. index = _mm256_sub_epi32(index, gt)
does index -= -1 or 0;

eq = _mm256_insert_epi32(eq, 0, I) is not an efficient way to zero
an element if it compiles as written (especially for elements outside
the low 4, because vpinsrd is only available with an XMM destination;
indices higher than 3 have to be emulated). Instead, _mm256_blend_epi32
(vpblendd) with a zeroed vector. vpblendd is a single-uop instruction
that runs on any port, vs. a shuffle that needs port 5 on Intel CPUs.

Also, you might consider generating the rot vectors with different
shuffles from the same source, or at least run 2 dep chains in parallel
that you use alternately, instead of one single dep chain through a
lane-crossing shuffle (3 cycle latency). That will increase ILP within
a single sort. 2 dep chains limits the number of vector constants to
a reasonable number, just 2: 1 for one rotate, and one for 2 rotate
steps combined.
```
Unfortunately, I haven't yet revisited his recommendations, but I thought
the goal of sorting as a shuffle within registers novel even when slower.
