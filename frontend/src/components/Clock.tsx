import { observer } from 'mobx-react-lite';
import { useStores } from '@/stores/StoreContext';
import { formatDateShort, formatTime } from '@/lib/time';
import { SECRET_TAP_ATTR } from '@/hooks/useSecretTap';
import { cn } from '@/lib/utils';

interface ClockProps {
  timezone: string;
  size?: 'lg' | 'sm';
  showDate?: boolean;
  className?: string;
  onPointerDown?: () => void;
}

/**
 * Always-visible current time. Observes `clock.now`, so only this component
 * re-renders each second — the rest of the room screen stays untouched.
 */
export const Clock = observer(function Clock({
  timezone,
  size = 'lg',
  showDate = true,
  className,
  onPointerDown,
}: ClockProps) {
  const { clock } = useStores();
  const [hours, minutes] = formatTime(clock.now, timezone).split(':');

  return (
    <div
      className={cn('select-none', className)}
      onPointerDown={onPointerDown}
      {...(onPointerDown ? { [SECRET_TAP_ATTR]: '' } : {})}
    >
      <div
        className={cn(
          'tabular font-extrabold leading-none tracking-tight',
          size === 'lg' ? 'text-[clamp(5rem,6.5vw,7rem)]' : 'text-5xl',
        )}
        aria-label="Current time"
      >
        {hours}
        <span className="animate-blink">:</span>
        {minutes}
      </div>
      {showDate && (
        <div
          className={cn(
            // Negative margin: `leading-none` still leaves the font's internal
            // descender space under the digits, so the date needs pulling up to
            // sit directly beneath them.
            'font-medium text-white/70',
            size === 'lg' ? '-mt-2 text-3xl' : 'mt-0.5 text-base',
          )}
        >
          {formatDateShort(clock.now, timezone)}
        </div>
      )}
    </div>
  );
});
