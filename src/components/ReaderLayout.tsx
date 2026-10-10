import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { BottomNav } from './BottomNav';
import { ReaderNavigation } from './ReaderNavigation';

export function ReaderLayout({children}:{children:ReactNode}) {
  const {pathname}=useLocation();
  const study=pathname.startsWith('/study');
  const collectionReader=pathname==='/explore'||pathname==='/extended';
  return <><ReaderNavigation/><Navbar/>
    <main className={study
      ?'flex-1 min-h-0 w-full mx-auto max-w-[1600px] overflow-hidden px-2 sm:px-4 pb-16 md:pb-3'
      :`flex-1 max-w-[1600px] w-full mx-auto ${collectionReader?'px-3':'px-2'} sm:px-4 py-3 overflow-y-auto overscroll-contain pb-16 md:pb-6`}>
      {children}
    </main><BottomNav/></>;
}
