# Compile time validation and optimization
*2020-02-23*
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
