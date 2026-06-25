'use client'

import { Printer } from 'lucide-react'
import { Button } from '@components/ui/button'

const ResumePrintButton = () => (
  <Button type="button" variant="outline" onClick={() => window.print()} className="print:hidden">
    <Printer className="mr-2 h-4 w-4" />
    Print
  </Button>
)

export default ResumePrintButton
