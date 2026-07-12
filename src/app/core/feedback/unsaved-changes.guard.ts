import { CanDeactivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { FeedbackService } from './feedback.service';

export interface CanWarnUnsavedChanges {
  hasUnsavedChanges?: () => boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<CanWarnUnsavedChanges> = (component) => {
  if (!component.hasUnsavedChanges?.()) return true;
  return inject(FeedbackService).confirm({
    title: 'Unsaved changes',
    message: 'You have unsaved changes. Do you want to leave without saving?',
    cancelText: 'Stay',
    confirmText: 'Leave',
    tone: 'warning'
  });
};
