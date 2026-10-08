/** Transport mapping shared by the controller and its contract tests. */
export type ReviewNoteRecord = {
  id: string; workpackage: string; body: string; status: string; raisedAt: Date;
  resolution: string | null; resolvedAt: Date | null;
};

export function toReviewNoteView(note: ReviewNoteRecord) {
  return {
    id: note.id, workpackage: note.workpackage, body: note.body, status: note.status,
    raisedAt: note.raisedAt.toISOString(), resolution: note.resolution, resolvedAt: note.resolvedAt?.toISOString() ?? null,
  };
}
