import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function SplashScreen() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      const name = localStorage.getItem('operator_name');
      navigate(name ? '/home' : '/login', { replace: true });
    }, 400);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-white">
      <img src="/logo.jpg" alt="Shrimp App" className="mb-4 h-24 rounded-lg" />
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
    </div>
  );
}
