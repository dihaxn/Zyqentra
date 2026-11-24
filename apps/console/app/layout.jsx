import './globals.css';

export const metadata = {
  title: 'Zyqentra',
  description: 'Your team and its AI agents on one board, on OpenClaw.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
