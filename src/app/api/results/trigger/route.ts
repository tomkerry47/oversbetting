// Keep the existing endpoint for main-page and history clients, but execute
// result processing in the app rather than dispatching a GitHub workflow.
export { POST } from '../route';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
