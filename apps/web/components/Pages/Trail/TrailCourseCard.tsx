'use client'

import PublicCourseCard from '@components/Pages/Courses/PublicCourseCard'

interface TrailCourseCardProps {
  course: any
  run: any
  orgslug: string
}

function TrailCourseCard(props: TrailCourseCardProps) {
  return (
    <PublicCourseCard
      course={props.course}
      run={props.run}
      orgslug={props.orgslug}
    />
  )
}

export default TrailCourseCard
