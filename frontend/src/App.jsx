import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import { HOME, useAuth } from './context/AuthContext';
import { LoadingPage } from './components/ui';
import Login from './pages/Login';
import Register from './pages/Register';
import Restaurants from './pages/Restaurants';
import RestaurantMenu from './pages/RestaurantMenu';
import Cart from './pages/customer/Cart';
import MyOrders from './pages/customer/MyOrders';
import OrderDetail from './pages/customer/OrderDetail';
import AIInsights from './pages/customer/AIInsights';
import OwnerDashboard from './pages/owner/OwnerDashboard';
import OwnerOrders from './pages/owner/OwnerOrders';
import MenuManagement from './pages/owner/MenuManagement';
import Returns from './pages/owner/Returns';
import DeliveryDashboard from './pages/delivery/DeliveryDashboard';

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingPage />;
  return <Navigate to={user ? HOME[user.role] : '/restaurants'} replace />;
}

const customer = (el) => <ProtectedRoute roles={['customer']}>{el}</ProtectedRoute>;
const owner = (el) => <ProtectedRoute roles={['owner']}>{el}</ProtectedRoute>;
const delivery = (el) => <ProtectedRoute roles={['delivery']}>{el}</ProtectedRoute>;

export default function App() {
  return (
    <div className="app">
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/restaurants" element={<Restaurants />} />
          <Route path="/restaurants/:id" element={<RestaurantMenu />} />
          <Route path="/cart" element={<Cart />} />

          <Route path="/orders" element={customer(<MyOrders />)} />
          <Route path="/orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
          <Route path="/insights" element={customer(<AIInsights />)} />

          <Route path="/owner" element={owner(<OwnerDashboard />)} />
          <Route path="/owner/orders" element={owner(<OwnerOrders />)} />
          <Route path="/owner/menu" element={owner(<MenuManagement />)} />
          <Route path="/owner/returns" element={owner(<Returns />)} />

          <Route path="/delivery" element={delivery(<DeliveryDashboard />)} />

          <Route path="*" element={<div className="empty"><div className="empty-icon">🍽️</div><h2>Page not found</h2><a href="/">Go home</a></div>} />
        </Routes>
      </main>
    </div>
  );
}
