import './globals.css';
import { Chakra_Petch, Archivo } from 'next/font/google';
import Nav from '../components/Nav';

const display = Chakra_Petch({
  subsets: ['latin'], weight: ['500', '700'], variable: '--font-display'
});
const body = Archivo({ subsets: ['latin'], variable: '--font-body' });

export const metadata = {
  title: 'Skor Tahmin — Dünya Kupası 2026',
  description: 'Arkadaşlarınla Dünya Kupası skor tahmin oyunu'
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr" className={`${display.variable} ${body.variable}`}>
      <body>
        <Nav />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
