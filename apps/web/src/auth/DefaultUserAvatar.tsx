/** Path to the shared default profile photo (no custom avatar). */
export const DEFAULT_AVATAR_SRC = "/icons/default-avatar.png";

type Props = {
  className?: string;
};

/** Default avatar image — never initials text. */
export function DefaultUserAvatar({ className }: Props) {
  return (
    <img
      className={className}
      src={DEFAULT_AVATAR_SRC}
      alt=""
      draggable={false}
    />
  );
}
