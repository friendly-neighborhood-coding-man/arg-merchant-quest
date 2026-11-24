/**
 * A tiny client-only bridge between the Story Lab and the campaign form that
 * share the "new campaign" page. The lab can ask whether the form holds unsaved
 * merchant text before a concept replaces the whole form.
 *
 * Both components are rendered on the same page, so module state is enough.
 * Nothing is persisted, and the bridge is a no-op when no form is mounted.
 */
type DirtyCheck = () => boolean;

let check: DirtyCheck | null = null;

export function registerCampaignFormDirtyCheck(next: DirtyCheck | null): void {
  check = next;
}

export function campaignFormHasUnsavedEdits(): boolean {
  return check ? check() : false;
}
