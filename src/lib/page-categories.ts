export function getPageCategory(pathname: string): string {
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/flashcards')) return 'study-flashcards';
  if (pathname.startsWith('/quiz')) return 'study-quiz';
  if (pathname.startsWith('/read')) return 'study-reader';
  if (pathname.startsWith('/chat')) return 'study-chat';
  if (pathname.startsWith('/mindmap')) return 'study-mindmap';
  if (pathname.startsWith('/study-resources')) return 'study-resources';
  if (pathname.startsWith('/progress')) return 'study-progress';
  return 'general';
}

export function getFeedbackType(userRole: string, pageCategory: string): 'user' | 'builder' {
  // Admin/builder on admin pages = builder feedback
  if ((userRole === 'admin' || userRole === 'builder') && pageCategory === 'admin') return 'builder';
  // Admin/builder on any page = still builder if they're talking about the platform
  if (userRole === 'admin' || userRole === 'builder') return 'builder';
  // Everyone else = user feedback
  return 'user';
}

// Page categories that are "study product" vs "platform"
export const STUDY_CATEGORIES = ['study-flashcards', 'study-quiz', 'study-reader', 'study-chat', 'study-mindmap', 'study-resources', 'study-progress'];
export const PLATFORM_CATEGORIES = ['admin', 'general'];
