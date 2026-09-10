type IosIconName =
  | 'home'
  | 'wallet'
  | 'user'
  | 'swap'
  | 'coin'
  | 'check'
  | 'chevron'
  | 'close';

type IosIconProps = {
  name: IosIconName;
  size?: number;
  filled?: boolean;
  className?: string;
};

export function IosIcon({
  name,
  size = 24,
  filled = false,
  className = '',
}: IosIconProps) {
  const stroke = filled ? 0 : 1.75;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`.trim()}
      aria-hidden
    >
      {name === 'home' ? (
        filled ? (
          <path d="M4.5 10.4 12 4.2l7.5 6.2V19a1.7 1.7 0 0 1-1.7 1.7h-3.4V14.8h-4.8V20.7H6.2A1.7 1.7 0 0 1 4.5 19V10.4Z" />
        ) : (
          <path
            d="M4.75 10.6 12 4.5l7.25 6.1V19a1.5 1.5 0 0 1-1.5 1.5h-3.4v-5.6H9.65v5.6H6.25a1.5 1.5 0 0 1-1.5-1.5V10.6Z"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinejoin="round"
          />
        )
      ) : null}
      {name === 'wallet' ? (
        filled ? (
          <>
            <path d="M3.4 7.2A2.2 2.2 0 0 1 5.6 5h12.8A2.2 2.2 0 0 1 20.6 7.2v1.1H3.4V7.2Z" />
            <path d="M3.4 9.6h17.2v7.2A2.2 2.2 0 0 1 18.4 19H5.6a2.2 2.2 0 0 1-2.2-2.2V9.6Zm12.7 4.6a1.15 1.15 0 1 0 2.3 0 1.15 1.15 0 0 0-2.3 0Z" />
          </>
        ) : (
          <>
            <rect
              x="3.5"
              y="6"
              width="17"
              height="12.5"
              rx="2.2"
              stroke="currentColor"
              strokeWidth={stroke}
            />
            <path
              d="M3.5 9.2h17"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
            />
            <circle cx="16.2" cy="14.1" r="1.05" fill="currentColor" />
          </>
        )
      ) : null}
      {name === 'user' ? (
        filled ? (
          <>
            <circle cx="12" cy="8" r="3.4" />
            <path d="M5.2 19.4c.6-3.4 3.3-5.3 6.8-5.3s6.2 1.9 6.8 5.3c.1.6-.3 1.1-.9 1.1H6.1c-.6 0-1-.5-.9-1.1Z" />
          </>
        ) : (
          <>
            <circle
              cx="12"
              cy="8"
              r="3.15"
              stroke="currentColor"
              strokeWidth={stroke}
            />
            <path
              d="M5.6 19.2c.7-3.2 3.2-4.9 6.4-4.9s5.7 1.7 6.4 4.9"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
            />
          </>
        )
      ) : null}
      {name === 'swap' ? (
        <path
          d="M7.2 8.2h9.1m0 0-2.6-2.6m2.6 2.6-2.6 2.6M16.8 15.8H7.7m0 0 2.6 2.6M7.7 15.8l2.6-2.6"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {name === 'coin' ? (
        <>
          <circle
            cx="12"
            cy="12"
            r="7.25"
            stroke="currentColor"
            strokeWidth={stroke}
          />
          <path
            d="M12 8.2v7.6M9.6 10.2c.5-.7 1.4-1.1 2.4-1.1 1.6 0 2.6.8 2.6 2 0 2.6-5.2 1.3-5.2 3.8 0 1.2 1.1 2.1 2.7 2.1 1.1 0 2-.4 2.5-1.1"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        </>
      ) : null}
      {name === 'check' ? (
        <path
          d="M5.5 12.3 9.8 16.5 18.5 7.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {name === 'chevron' ? (
        <path
          d="M6.5 9.25 12 14.75 17.5 9.25"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {name === 'close' ? (
        <path
          d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}
