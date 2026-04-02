/**
 * SCORM is intentionally disabled in core for now.
 * This route remains so older frontend paths return a stable disabled response
 * instead of importing the removed EE implementation.
 */
export async function GET() {
  return Response.json(
    {
      detail: 'SCORM is currently disabled in core and will be rebuilt natively in the future.',
      feature: 'scorm',
      enabled: false,
    },
    { status: 404 }
  )
}
