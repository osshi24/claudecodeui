/**
 * Environment Flag: Is Platform
 * Indicates if the app is running in Platform mode (hosted) or OSS mode (self-hosted)
 */
export const IS_PLATFORM = process.env.VITE_IS_PLATFORM === 'true';

/**
 * Environment Flag: Allow Registration
 *
 * The first account can always be created — that is initial setup. This flag
 * decides whether *additional* accounts may be registered afterwards.
 *
 * Off by default: the server binds 0.0.0.0 out of the box, and an open
 * registration form there hands anyone on the network a shell on this machine.
 */
export const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION === 'true';
