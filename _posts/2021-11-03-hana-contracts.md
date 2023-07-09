# Hana contacts as a library
<!---
---
layout: post
title:  "Hana Contracts as a Library"
date:   2021-11-03 03:24:00 -0700
categories: experiment
---
-->

A sketch of using hana to reduce overloads and check newly introduced lemmas.

[https://gcc.godbolt.org/z/WradzeKs9](https://gcc.godbolt.org/z/WradzeKs9)

```c++
// Inspired by http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/p1773r0.pdf
#include <exception>
#include <utility>
#include <string>
#include <sstream>
#include <algorithm>
#include <boost/hana.hpp>
namespace hana = boost::hana;
using namespace hana::literals;

template<class... LemmasT> struct Proof {
    // Apply the policy on the first lemma which is missing from the givens and fails the predicate (does not hold).
    template<class T, class... GivensT, class F> Proof(const T& value, Proof<GivensT...>, F&& f) {
        constexpr auto lemmas = hana::make_set(hana::type_c<LemmasT>...);
        constexpr auto givens = hana::make_set(hana::type_c<GivensT>...);
        hana::for_each(hana::difference(lemmas, givens), [&value,&f](const auto x) {
            if (not decltype(x)::type::holds(value)) {
                f(x);
            }
        });
    }

    Proof() {
        static_assert(sizeof...(LemmasT) == 0);
    }

    // Provide an interface to inform the compiler of the lemmas.
    template<class T> static auto optimize(const T& value) {
#ifndef NEVER_ASSUME
        __builtin_assume([&]() __attribute__((pure)) {
            return (LemmasT::holds(value) && ...);
        }());
#endif
    }
};

// Sort order to reduce instantiations? Not actually used.
template<class...> struct CanonHana;
template<class... Ts> struct CanonHana<hana::tuple<Ts...>> {
    using type = Proof<typename Ts::type...>;
};
template<class... Ts> using Canon = typename CanonHana<decltype(
    hana::sort(hana::tuple_t<Ts...>, [](const auto x, const auto y){
        return decltype(x)::type::value < decltype(y)::type::value;
    })
)>::type;

// Policy tags
struct Assume{}; struct RaiseUnless{}; struct AbortUnless{}; using ValidDefault = AbortUnless;
inline constexpr Assume assume_v{}; inline constexpr RaiseUnless raise_unless_v{};
inline constexpr AbortUnless abort_unless_v{};
template<class T> struct PreconditionError {
    std::string what;
    template<class U> PreconditionError(const U& x) : what([&](){
        std::stringstream ss;
        ss << x;
        return ss.str();
    }()) {}
};
// A Valid wrapper. Need to be able to both hold values for return values (most often used for post-conditions on return values), and hold references (most often used pre-conditions on parameters)
// Only cover ValidRef here. Not sure if it's possible to consolidate.
template<class, class...> class ValidRef;
template<class T, class... LemmasT> struct ValidRef<T, Proof<LemmasT...>> {
    const T& t;
private:
    template<class... GivensT, class F> ValidRef(ValidRef<T, Proof<GivensT...>> x, F&& f)
        : t([&](){
            Proof<LemmasT...> _(x.t, Proof<GivensT...>{}, f);
            return x;
        }()) {}
    public:

    // RaiseUnless
    ValidRef(const T& x, RaiseUnless) : ValidRef(ValidRef<T, Proof<>>(x, Assume{}), RaiseUnless{}) {}; 
    template<class... GivensT> ValidRef(ValidRef<T, Proof<GivensT...>> x, RaiseUnless)
        : ValidRef(x, [&x](const auto lemma) {
            throw PreconditionError<typename decltype(lemma)::type>(x.t);
        }) {}

    // AbortUnless
    ValidRef(const T& x, AbortUnless) : ValidRef(ValidRef<T, Proof<>>(x, Assume{}), AbortUnless{}) {}; 
    template<class... GivensT> ValidRef(ValidRef<T, Proof<GivensT...>> x, AbortUnless)
        : ValidRef(x, [&x](const auto lemma) {
            std::terminate();
        }) {}

    // Assume
    ValidRef(const T& x, Assume) : ValidRef(ValidRef<T, Proof<>>(x, Assume{}), Assume{}) {}; 
    template<class... GivensT> ValidRef(ValidRef<T, Proof<GivensT...>> x, Assume)
        : ValidRef(x, [&x](const auto lemma) {}) {}
    
    // Default
    ValidRef(const T& x) : ValidRef(ValidRef<T, Proof<>>(x, Assume{}), ValidDefault{}) {}; 
    template<class... GivensT> ValidRef(ValidRef<T, Proof<GivensT...>> x)
        : ValidRef(x, ValidDefault{}) {}

    void optimize() { Proof<LemmasT...>::optimize(t); }
    operator const T&() { optimize(); return t; }
    const T& value() { return t; }
};

template<auto Divisor> struct DivisibleBy {
    static constexpr auto value = 1_c;
    template<class U> static constexpr bool holds(const U& dividend) {
        static_assert(std::is_same_v<U, std::decay_t<decltype(Divisor)>>);
        return dividend % Divisor == 0;
    }
};

template<auto Expected> struct NotEqual {
    static constexpr auto value = 2_c;
    template<class U> static constexpr bool holds(const U& value) {
        static_assert(std::is_same_v<U, std::decay_t<decltype(Expected)>>);
        return value != Expected;
    }
};

void limiter(float* data, ValidRef<size_t, Proof<NotEqual<0ul>, DivisibleBy<32ul>>> size)
{
    for (size_t i = 0; i < size; ++i)
      data[i] = std::clamp(data[i], -1.0f, 1.0f);
}

auto limiter_default(float* data, size_t size) {
    return limiter(data, size);
}
auto limiter_except(float* data, size_t size) {
    return limiter(data, {size, raise_unless_v});
}
auto limiter_abort(float* data, size_t size) {
    return limiter(data, {size, abort_unless_v});
}
auto limiter_assume(float* data, size_t size) {
    return limiter(data, {size, assume_v});
}

void limiter_slow(float* data, size_t size)
{
    for (size_t i = 0; i < size; ++i)
      data[i] = std::clamp(data[i], -1.0f, 1.0f);
}
auto limiter_slow_two_step(float* data, ValidRef<size_t, Proof<NotEqual<0ul>, DivisibleBy<32ul>>> size) {
    size.optimize();
    return limiter_slow(data, size.value()); // the implicit operator T& will also optimize
}

// Alternative extensible ordering with default
// #define LEMMA(T, N) hana::int_<N> order_t(hana::type<T>) { return {}; } void dup_check(hana::int_<N>) {}
// hana::int_<0> order_t(...) { return {}; }
// ORDER(Z, 1);
// ORDER(N, 2);
```
