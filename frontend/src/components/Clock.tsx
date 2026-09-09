import { observer } from 'mobx-react-lite';
import { useStores } from '@/stores/StoreContext';
import { formatDate, formatTime } from '@/lib/time';
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
            'mt-2 font-medium text-white/70',
            size === 'lg' ? 'text-3xl' : 'text-base',
          )}
        >
          {formatDate(clock.now, timezone)}
        </div>
      )}
    </div>
  );
});
