// the star after a label whose field must be filled; screen readers hear "required"
export function RequiredMark() {
  return (
    <>
      <span aria-hidden className="ml-0.5 text-danger">
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}
