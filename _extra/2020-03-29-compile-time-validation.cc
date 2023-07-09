#include <type_traits>
#include <optional>

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

template <class T, class... Properties> class valid_value;
template <class T, class... Properties> class valid_ref {
  constexpr valid_ref(const T &t) : value(t) {}

public:
  const T& value;

  static constexpr auto assume(const T &t) {
      return valid_ref(t);
  }

  template <class... FromProperties>
  constexpr valid_ref(valid_ref<T, FromProperties...> v2) : value(v2.value) {
    static_assert(sizeof...(Properties) <= sizeof...(FromProperties));
    static_assert(subset_of<list<Properties...>, FromProperties...>);
  }
  template <class... FromProperties>
  constexpr valid_ref(valid_value<T, FromProperties...> v2) : value(v2.value) {
    static_assert(sizeof...(Properties) <= sizeof...(FromProperties));
    static_assert(subset_of<list<Properties...>, FromProperties...>);
  }

  constexpr void optimize() const {
#ifdef NDEBUG
    __builtin_assume([&]() __attribute__((pure)) {
        return (Properties::ok(value) && ...);
        }());
#endif
  }
};
template <class T> struct valid_ref<T> {
  const T &value;
  constexpr valid_ref(const T &t) : value(t) {}
};
template <class T, class... ToProperties, class... FromProperaties>
constexpr std::optional<valid_ref<T, ToProperties...>>
validate_ref(valid_ref<T, FromProperaties...> t) {
  if (!((is_in<ToProperties, FromProperaties...> || ToProperties::ok(t.value)) && ...)) {
    return std::nullopt;
  }
  return valid_ref<T, ToProperties...>::assume(t.value);
}
template <class T, class... ToProperties> constexpr auto validate_ref(const T &t) {
  return validate_ref<T, ToProperties...>(valid_ref<T>(t));
}

template <class T, class... Properties> class valid_value {
  constexpr valid_value(const T &t) : value(t) {}

public:
  const T& value;

  static constexpr auto assume(const T &t) {
      return valid_value(t);
  }

  template <class... FromProperties>
  constexpr valid_value(valid_value<T, FromProperties...> v2) : value(v2.value) {
    static_assert(sizeof...(Properties) <= sizeof...(FromProperties));
    static_assert(subset_of<list<Properties...>, FromProperties...>);
  }
  template <class... FromProperties>
  constexpr valid_value(valid_ref<T, FromProperties...> v2) : value(v2.value) {
    static_assert(sizeof...(Properties) <= sizeof...(FromProperties));
    static_assert(subset_of<list<Properties...>, FromProperties...>);
  }

  constexpr void optimize() const {
#ifdef NDEBUG
    __builtin_assume([&]() __attribute__((pure)) {
        return (Properties::ok(value) && ...);
        }());
#endif
  }
};
template <class T> struct valid_value<T> {
  const T &value;
  constexpr valid_value(const T &t) : value(t) {}
};
template <class T, class... ToProperties, class... FromProperaties>
constexpr std::optional<valid_value<T, ToProperties...>>
validate_value(valid_value<T, FromProperaties...> t) {
  if (!((is_in<ToProperties, FromProperaties...> || ToProperties::ok(t.value)) && ...)) {
    return std::nullopt;
  }
  return valid_value<T, ToProperties...>::assume(t.value);
}
template <class T, class... ToProperties> constexpr auto validate_value(const T &t) {
  return validate_value<T, ToProperties...>(valid_value<T>(t));
}

// Goal
struct non_zero {
  constexpr static bool ok(const int &t) { return t != 0; }
};
struct non_negative {
  constexpr static bool ok(const int &t) { return t >= 0; }
};
constexpr int sqrt_of(valid_ref<int, non_negative> x) {
  int sqrt = 0;
  for (; sqrt*sqrt<x.value; ++sqrt);
  return sqrt;
}
constexpr int divide_by(int x, valid_ref<int, non_zero> y) {
    return x / y.value;
}
constexpr int divide_by_sqrt_of(int x, valid_ref<int, non_negative, non_zero> y) {
  y.optimize();
  auto sqrt = sqrt_of(y);
  return divide_by(x, valid_ref<int, non_zero>::assume(sqrt));
}
inline constexpr int nine = 9;
inline constexpr auto valid_9 = validate_ref<int, non_zero, non_negative>(nine);
static_assert(valid_9 && 1 == divide_by_sqrt_of(5, *valid_9));

valid_value<int,non_negative> f(valid_ref<int, non_negative> x) {
    x.optimize();
    if (x.value<0) {
        return valid_value<int, non_negative>::assume(0);
    }

    return valid_value<int, non_negative>::assume(2*x.value);
}
// static_assert(1 == divide_by_sqrt_of(5, 9));