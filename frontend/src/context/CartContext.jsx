import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);
const KEY = 'campusbite_cart';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null') || { restaurant: null, items: [] };
  } catch {
    return { restaurant: null, items: [] };
  }
}

/** Cart = items from ONE restaurant. Kept in React state (and mirrored to localStorage). */
export function CartProvider({ children }) {
  const [cart, setCart] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cart));
    } catch {
      /* ignore */
    }
  }, [cart]);

  const add = useCallback((restaurant, dish) => {
    let switched = false;
    setCart((c) => {
      if (c.restaurant && c.restaurant.id !== restaurant.id) {
        switched = true;
        return { restaurant: { id: restaurant.id, name: restaurant.name }, items: [{ ...dish, quantity: 1 }] };
      }
      const existing = c.items.find((i) => i.id === dish.id);
      const items = existing ? c.items.map((i) => (i.id === dish.id ? { ...i, quantity: Math.min(50, i.quantity + 1) } : i)) : [...c.items, { ...dish, quantity: 1 }];
      return { restaurant: { id: restaurant.id, name: restaurant.name }, items };
    });
    return switched;
  }, []);

  const setQty = useCallback((dishId, quantity) => {
    setCart((c) => {
      const items = quantity <= 0 ? c.items.filter((i) => i.id !== dishId) : c.items.map((i) => (i.id === dishId ? { ...i, quantity: Math.min(50, quantity) } : i));
      return items.length ? { ...c, items } : { restaurant: null, items: [] };
    });
  }, []);

  const remove = useCallback((dishId) => setQty(dishId, 0), [setQty]);
  const clear = useCallback(() => setCart({ restaurant: null, items: [] }), []);

  const value = useMemo(() => {
    const count = cart.items.reduce((n, i) => n + i.quantity, 0);
    const subtotal = cart.items.reduce((n, i) => n + i.price * i.quantity, 0);
    const qtyOf = (id) => cart.items.find((i) => i.id === id)?.quantity || 0;
    return { cart, count, subtotal, qtyOf, add, setQty, remove, clear };
  }, [cart, add, setQty, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
