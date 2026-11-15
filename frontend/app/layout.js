import './globals.css';
import { AuthProvider } from '@/lib/auth';

export const metadata = {
  title: 'AI TestGen',
  description: 'AI-powered test generation and online examination platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
