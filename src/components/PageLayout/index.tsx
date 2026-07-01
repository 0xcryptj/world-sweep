import clsx from 'clsx';
import { ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

/**
 * This component is a simple page layout component to help with design consistency
 * Feel free to modify this component to fit your needs
 */
export const Page = (props: { children: ReactNode; className?: string }) => {
  return (
    <div
      className={twMerge(
        clsx('flex h-dvh max-w-[100vw] flex-col overflow-x-hidden', props.className),
      )}
    >
      {props.children}
    </div>
  );
};

const Header = (props: { children: ReactNode; className?: string }) => {
  return (
    <header
      className={twMerge(
        'forager-header flex flex-col justify-center px-6 pt-6 pb-3 z-10',
        clsx(props.className),
      )}
    >
      {props.children}
    </header>
  );
};

const Main = (props: { children: ReactNode; className?: string }) => {
  return (
    <main
      className={twMerge(
        clsx(
          'forager-scroll grow bg-forager-bg p-6 pt-3',
          props.className,
        ),
      )}
    >
      {props.children}
    </main>
  );
};

const Footer = (props: { children: ReactNode; className?: string }) => {
  return (
    <footer
      className={twMerge(
        'forager-footer px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1',
        clsx(props.className),
      )}
    >
      {props.children}
    </footer>
  );
};

Page.Header = Header;
Page.Main = Main;
Page.Footer = Footer;
