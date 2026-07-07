'use client'
import { useMediaQuery } from 'usehooks-ts'
import { Check, FileText, ListTree, Video, X, StickyNote, Backpack, ArrowRight } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import Link from 'next/link'
import React from 'react'
import { useTranslation } from 'react-i18next'

interface ActivityChapterDropdownProps {
  course: any
  currentActivityId: string
  orgslug: string
  trailData?: any
}

export default function ActivityChapterDropdown(props: ActivityChapterDropdownProps): React.ReactNode {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Clean up course UUID by removing 'course_' prefix if it exists
  const cleanCourseUuid = props.course.course_uuid?.replace('course_', '');

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  // Function to get the appropriate icon for activity type
  const getActivityTypeIcon = (activityType: string) => {
    switch (activityType) {
      case 'TYPE_VIDEO':
        return <Video size={10} />;
      case 'TYPE_DOCUMENT':
        return <FileText size={10} />;
      case 'TYPE_DYNAMIC':
        return <StickyNote size={10} />;
      case 'TYPE_ASSIGNMENT':
        return <Backpack size={10} />;
      default:
        return <FileText size={10} />;
    }
  };

  const getActivityTypeLabel = (activityType: string) => {
    switch (activityType) {
      case 'TYPE_VIDEO':
        return t('activities.video');
      case 'TYPE_DOCUMENT':
        return t('activities.document');
      case 'TYPE_DYNAMIC':
        return t('activities.page');
      case 'TYPE_ASSIGNMENT':
        return t('activities.assignment');
      default:
        return t('activities.learning_material');
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className="bg-card rounded-full px-5 nice-shadow flex items-center space-x-2 p-2.5 text-muted-foreground hover:bg-muted transition delay-150 duration-300 ease-in-out"
        aria-label="View all activities"
        title="View all activities"
      >
        <ListTree size={17} />
        <span className="text-xs font-bold">{t('courses.chapters')}</span>
      </button>
      
      {isOpen && (
        <div className={`absolute z-dropdown mt-2 ${isMobile ? 'right-0 w-[90vw] sm:w-72' : 'right-0 w-72'} max-h-[70vh] cursor-pointer overflow-y-auto bg-card rounded-lg shadow-xl border border-border py-1 animate-in fade-in duration-200`}>
          <div className="px-3 py-1.5 border-b border-border flex justify-between items-center">
            <h3 className="text-sm font-semibold text-foreground">{t('courses.course_content')}</h3>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-muted-foreground p-1 rounded-full hover:bg-muted cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
          
          <div className="py-0.5">
            {props.course.chapters.map((chapter: any, index: number) => (
              <div key={chapter.id} className="mb-1">
                <div className="px-3 py-1.5 text-sm font-medium text-muted-foreground bg-muted border-y border-border flex items-center">
                  <div className="flex items-center space-x-1.5">
                    <div className="bg-gray-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {index + 1}
                    </div>
                    <span>{chapter.name}</span>
                  </div>
                </div>
                <div className="py-0.5">
                  {chapter.activities.map((activity: any) => {
                    const cleanActivityUuid = activity.activity_uuid?.replace('activity_', '');
                    const isCurrent = cleanActivityUuid === props.currentActivityId.replace('activity_', '');
                    
                    // Find the correct run and check if activity is complete
                    const run = props.trailData?.runs?.find(
                      (run: any) => {
                        const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '');
                        return cleanRunCourseUuid === cleanCourseUuid;
                      }
                    );
                    
                    const isComplete = run?.steps?.find(
                      (step: any) => step.activity_id === activity.id && step.complete === true
                    );
                    
                    return (
                      <Link
                        key={activity.id}
                        href={getUriWithOrg(props.orgslug, routePaths.org.courseActivity(cleanCourseUuid, cleanActivityUuid))}
                        prefetch={false}
                        onClick={() => setIsOpen(false)}
                      >
                        <div 
                          className={`group hover:bg-muted transition-colors px-3 py-2 ${
                            isCurrent ? 'bg-muted border-l-2 border-border pl-2.5 font-medium' : ''
                          }`}
                        >
                          <div className="flex space-x-2 items-center">
                            <div className="flex items-center">
                              {isComplete ? (
                                <div className="relative cursor-pointer">
                                  <Check size={14} className="stroke-[2.5] text-teal-600" />
                                </div>
                              ) : (
                                <div className="text-neutral-300 cursor-pointer">
                                  <Check size={14} className="stroke-[2]" />
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col grow">
                              <div className="flex items-center space-x-1.5 w-full">
                                <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                                  {activity.name}
                                </p>
                                {isCurrent && (
                                  <div className="flex items-center space-x-1 text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full text-[10px] font-medium animate-pulse">
                                    <span>{t('activities.current')}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center space-x-1 mt-0.5 text-muted-foreground">
                                {getActivityTypeIcon(activity.activity_type)}
                                <span className="text-[10px] font-medium">
                                  {getActivityTypeLabel(activity.activity_type)}
                                </span>
                              </div>
                            </div>
                            <div className="text-neutral-300 group-hover:text-muted-foreground transition-colors cursor-pointer">
                              <ArrowRight size={12} />
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 
