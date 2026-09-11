export const mollweideHints = [
  '1 · Aim for an ellipse twice as wide as it is tall. The equator is a straight line; each pole becomes a point. Work on a unit-radius sphere.',
  '2 · Use an auxiliary angle θ for latitude φ, defined by 2θ + sin(2θ) = π sin(φ). Longitude remains separate. This equation is the area-preserving step.',
  '3 · Solve for θ between −π/2 and π/2. Bisection repeatedly halves that interval; NumPy’s where can update all latitudes together. Then x = (2√2/π) λ cos(θ), y = √2 sin(θ).',
  '4 · At ±90° latitude set x = 0 and y = ±√2 explicitly. Keep longitudes within ±π. Check the equator before trusting the whole map, and avoid dividing by a zero derivative at a pole.',
]
