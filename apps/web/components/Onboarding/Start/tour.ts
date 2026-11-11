
import { tr } from '@/lib/tr'/** The four-scene intro that opens /start, also shown to invited staff with a new account (Onboarding/Joined). */
export const TOUR = [
  { get title() { return tr('lit.tour.welcome_to_life2launch', 'Welcome to Life2Launch') }, get lede() { return tr('lit.tour.where_people_map_out', 'Where people map out what’s next and take charge of getting there.') } },
  { get title() { return tr('lit.tour.you_guide_they_go', 'You guide. They go.') }, get lede() { return tr('lit.tour.hand_someone_a_plan_and', 'Hand someone a plan and they move through it on their own. You see every step land, and know exactly when it’s your turn.') } },
  { get title() { return tr('lit.tour.step_in_right_where_it', 'Step in right where it counts') }, get lede() { return tr('lit.tour.review_work_answer_questions_and', 'Review work, answer questions and cheer them on in one conversation, tied to the plan they’re on.') } },
  { get title() { return tr('lit.tour.celebrate_every_launch', 'Celebrate every launch') }, get lede() { return tr('lit.tour.finished_plans_add_up_to', 'Finished plans add up to a portfolio they own, with badges and real work to show schools and employers.') } },
]

export const H1 = 'text-[clamp(30px,3.4vw,44px)] font-extrabold leading-[1.05] tracking-[-0.035em]'
export const LEDE = 'mt-3 text-[16.5px] leading-normal text-muted-foreground'
