<!---
Note that index.md is auto-generated, so it shouldn't be edited directly run build.sh
-->
- [Compile time validation and optimization](#compile-time-validation-and-optimization)
- [Return Elision Errors](#return-elision-errors)
- [Hana contacts as a library](#hana-contacts-as-a-library)
- [Bio](#bio)

# Compile time validation and optimization
<!---
---
layout: post
title:  "Compile time validation and optimization"
date:   2020-03-29 20:19:29 -0700
categories: experiment
---
-->

Annotate references and values to reduce runtime errors, improve optimization, and specify requirements more explicitly.

We can annotate references and values with templates to:

    1. Generate compile errors when input isn't validated.
    2. Communicate the requirements of a function.
    3. Remove unnecessary redundant input validation.
    4. Propogate and move information for optimization to where it is used.

Wide contracts can introduce error states which increase the burden to test, obfuscate logic, make code harder to compose, and can have a runtime impact. Narrow contracts with pre-conditions increase the danger of mis-use, can be hard to communicate to the user and the compiler. Because these constraints are hard to validate and verify across package boundaries, defensive programming requires internal code to be treated like untrusted input.

Some examples that I've seen include:


```c++
#include <cassert>
#include <string>

enum class my_enum { X, Y };
int result_from_enum(my_enum e) {
    int result = 0;
    switch (e) {
    case my_enum::X: result += 1; break;
    case my_enum::Y: result += 2; break;
    default: assert(false);
    }
    switch (e) {
    case my_enum::X: result *= 2; break;
    case my_enum::Y: result *= 4; break;
    default: assert(false);
    }
    return result;
}

int first_byte(std::string s, char & out) {
    if (s.empty()) {
        return -1;
    }
    out = s.front();
    return 0;
}
```

Wrapper types can make interfaces more difficult to use. If your value is a member of the wrapper type, you can introduce additional copies for each step of validation. They also don't compose well, so if you have a `NonNegative{NonZero{input_value}}`, but your function requires a non-negative number, but accepts zero, you're out of luck. We would like to provide interfaces that compile only if it's pre-conditions are explicitly validated or assumed. We would also like to propagate that information to the optimizer.

`divide_by_sqrt_of(5, x)` should not compile because we aren't handling negative numbers for sqrt and dividing by zero is undefined. To ensure that this works well with large types, we define a wrapper reference which is tagged with the set of conditions that have been checked. The signature of the function can then describe its pre-condtions by annotating its inputs with the pre-conditions. `divide_by_sqrt_of(int, valid_ref<int, non_negative, non_zero>)` requires its second argument to be non-negative and non-zero.


```c++
template <class T, class... Properties> class valid_ref {
  constexpr valid_ref(const T &value) : value(value) {}

public:
  const T &value;

  // Require the user to be explicit about his assumptions.
  static constexpr auto assume(const T &t) { return valid_ref(t); }

  // Implicitly construct a validated reference if the new one has fewer
  // properties or the same properties in a different order.
  template <class... FromProperties>
  constexpr valid_ref(valid_ref<T, FromProperties...> v2) : value(v2.value) {
    static_assert(sizeof...(Properties) <= sizeof...(FromProperties));
    static_assert(subset_of<list<Properties...>, FromProperties...>);
  }

  // Let the user choose whether they want compiler optimizations based on the
  // validated properties.
  constexpr void optimize() const {
#ifdef NDEBUG
    __builtin_assume([&]() __attribute__((pure)) {
      return (Properties::ok(value) && ...);
    }());
#endif
  }
};

// No restrictions on providing a reference with no associated properties.
template <class T> struct valid_ref<T> {
  const T &value;
  constexpr valid_ref(const T &t) : value(t) {}
};
```

We define properties in terms of classes which expose an `bool ok(const T&)` static function to check if the property holds. This allows the validation of the property to be associated with the reference that was validated at no runtime overhead. It also preserves and propogates that information. `optimize` re-checks the properties and feeds the information to clang. Wrapping the function in an immediately invoked lambda expression makes it convenient to ensure that it has no runtime effect.


```c++
template <class T, class... ToProperties, class... FromProperaties>
constexpr std::optional<valid_ref<T, ToProperties...>>
validate_ref(valid_ref<T, FromProperaties...> t) {
  if (!((is_in<ToProperties, FromProperaties...> ||
         ToProperties::ok(t.value)) &&
        ...)) {
    return std::nullopt;
  }
  return valid_ref<T, ToProperties...>::assume(t.value);
}

template <class T, class... ToProperties>
constexpr auto validate_ref(const T &t) {
  return validate_ref<T, ToProperties...>(valid_ref<T>(t));
}
```

`validate_ref` encodes the property checking into the type system by providing the primary interface for getting a validated reference. If the value cannot be validated, then `nullopt` is returned, so a valid_ref can only be obtained by explicitly calling `assume` or by handling an optional. Properties which have been already checked are included and do not need to be re-checked.


```c++
template <class T, class... Us>
inline constexpr bool is_in = (std::is_same_v<T, Us> || ...);

template <class...> struct list;

namespace impl {
template <class, class...> struct subset_of;
template <class... Ts, class... Us> struct subset_of<list<Ts...>, Us...> {
  static constexpr bool value = (is_in<Ts, Us...> && ...);
};
} // namespace impl

template <class T, class... Us>
inline constexpr bool subset_of = impl::subset_of<T, Us...>::value;
```

Implicit conversions to weaker or re-ordered valid_refs requires checking if the properties needed are a subset of the properties which have been validated, so we provide a few metafunctions for checking these properties. See Walter Brown : Modern Template Metaprogramming @ CppCon 2014 for an introduction to metafunctions.

 - [https://www.youtube.com/watch?v=Am2is2QCvxY](https://www.youtube.com/watch?v=Am2is2QCvxY)


```c++
struct non_zero {
  constexpr static bool ok(const int &t) { return t != 0; }
};

struct non_negative {
  constexpr static bool ok(const int &t) { return t >= 0; }
};
```

We define our precondtions as structs with a validation function which allows them to have names in any compile errors or function signatures. If these compile time pre-conditions were tracked with lambdas, even lambda which exposed their implementation would still not have a descriptive, re-usable, short name.


```c++
constexpr int sqrt_of(valid_ref<int, non_negative> x) {
  int sqrt = 0;
  for (; sqrt * sqrt < x.value; ++sqrt)
    ;
  return sqrt;
}
constexpr int divide_by(int x, valid_ref<int, non_zero> y) {
  return x / y.value;
}
constexpr int divide_by_sqrt_of(int x,
                                valid_ref<int, non_negative, non_zero> y) {
  auto sqrt = sqrt_of(y);
  return divide_by(x, valid_ref<int, non_zero>::assume(sqrt));
}
inline constexpr int nine = 9;
inline constexpr auto valid_9 = validate_ref<int, non_zero, non_negative>(nine);
static_assert(valid_9 && 1 == divide_by_sqrt_of(5, *valid_9));
```

`sqrt` requires that its argument is non-negative and returns a number whose square is not less than its input. `divide_by` requires that its argument is non-zero, so `divide_by_sqrt_of` requires both properties. Here, I've used assume because a square root of zero is well defined. We could provide a dispatch mechanism which returned a `valid_value<int, non_zero, non_negative>` for inputs that have been validated to be non-zero and returned `valid_value<int, non_negative>` for numbers which are validated to be non-negative.

This would require resolving ambiguous functions and defining valid_value, and this still pushes all reasoning about pre-conditions and post conditions to within the local scope of the function.


```c++
static_assert(1 == divide_by(5, 9));
static_assert(1 == divide_by(5, *validate_ref<int, non_negative>(9));
static_assert(1 == divide_by(5, *validate_ref<int>(9));
static_assert(1 == divide_by(5, valid_ref<int, non_zero>(9));
```

Failure to validate with the correct parameters fails to compile. Assumptions are explicit rather than implicit. Gudmundur F. Adalsteinsson analyzes the performance benefits from the contract proposal which was rejected from C++20. A similar effect is here. Code gen for this, all code presented here is available on compiler explorer.

 - [https://gummif.github.io/blog/contract_code_gen.html](https://gummif.github.io/blog/contract_code_gen.html)
 - [https://gcc.godbolt.org/z/o71vuS](https://gcc.godbolt.org/z/o71vuS)


```c++
int f(valid_ref<int, non_negative, non_zero> x) {
  x.optimize();
  if (x.value < 0) {
    return 0;
  }

  return 2 * x.value;
}
```

This interface could be extended to make validation implicity by providing constructors which execute new properties, and throw an exception if not all properties can be validated. Additional work could be done to improve the ergonomics, and providing an interface for handling values. You could consider providing conjunctions and disjunctions of pre-conditions, or provide an overloaded algebra of its types for how properties are preserved under operations. For example, non-zero is preserved (whether true or false) under square root.
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
# Bio
Software engineer with experience from developing tools for performance
analysis, to high-performance protocol stacks, and micro-optimized
searching and sorting algorithms.

Interested in algorithms, C++, databases, file systems, GPUs, and how
to best make use of multi-core CPUs with SIMD.

## [2020 Resume](https://eyepatchParrot.github.io/assets/vansandt-resume.pdf)
