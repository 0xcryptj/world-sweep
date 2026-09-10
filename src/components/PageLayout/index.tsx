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
        clsx('relative z-10 flex h-dvh max-w-[100vw] flex-col overflow-x-hidden', props.className),
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
        'forager-header z-10 flex flex-col justify-end pl-[var(--forager-page-x)] pr-[var(--forager-page-x-end)] pt-[max(0.75rem,env(safe-area-inset-top))] pb-2',
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
          'forager-scroll grow bg-transparent pl-[var(--forager-page-x)] pr-[var(--forager-page-x-end)] pt-[var(--forager-page-y)] pb-[var(--forager-stack-loose)]',
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
        'forager-footer px-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-0',
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
