// the star after a label whose field must be filled; screen readers hear "required". On chestnut it's ivory (red
// can't be read there)
export function RequiredMark({ onDark = false }: { onDark?: boolean }) {
  return (
    <>
      <span aria-hidden className={onDark ? "ml-0.5 text-ivory/80" : "ml-0.5 text-danger"}>
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}
