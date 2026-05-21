import React from 'react'
import {
  Brain,
  Compass,
  Feather,
  GraduationCap,
  HeartPulse,
  Home,
  Lightbulb,
  MessageCircle,
  Mountain,
  Rocket,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react'

export type JournalCanvasId = 'identity' | 'lifestyle' | 'navigation'

export type JournalCardEntry = {
  fields: Record<string, string>
  starredFieldId?: string
  selectedOption?: string
  selectedOptions?: string[]
  starredOptions?: string[]
}

export type JournalShape = {
  canvases: Partial<Record<JournalCanvasId, {
    cards: Record<string, JournalCardEntry>
  }>>
}

export type JournalCardConfig = {
  id: string
  section?: string
  title: string
  label: string
  info: string
  type?: 'text' | 'rating' | 'multiSelect' | 'singleChoice'
  icon?: React.ComponentType<{ className?: string }>
  color: {
    dark: string
    light: string
  }
  optionSections?: Array<{
    title: string
    options: string[]
  }>
  options?: Array<{
    id: string
    label: string
    description: string
  }>
  fields: Array<{
    id: string
    section?: string
    label: string
    subtitle?: string
    placeholder: string
    multiline?: boolean
  }>
}

export type JournalCanvasConfig = {
  id: JournalCanvasId
  title: string
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  cards: JournalCardConfig[]
}

const PERSONAL_OPERATING_SYSTEM_CARD_STYLES = {
  mind: { icon: Brain, color: { dark: '#3B0D87', light: '#E9D5FF' } },
  body: { icon: HeartPulse, color: { dark: '#C2410C', light: '#FFEDD5' } },
  innerCompass: { icon: Compass, color: { dark: '#0A514D', light: '#99F6E4' } },
}

export const JOURNAL_CANVASES: JournalCanvasConfig[] = [
  {
    id: 'identity',
    title: 'Identity',
    label: 'Identity canvas',
    description: 'Capture the signals, roles, and language that make this person recognizable.',
    icon: UserRound,
    cards: [
      {
        id: 'dreams-ambitions',
        section: 'Personal Drivers',
        title: 'Dreams & Ambitions',
        label: 'Dreams & ambitions',
        info: 'Use this vision journey to imagine a future career, educational path, personal growth, gratitude, and next steps toward meaningful goals.',
        icon: Rocket,
        color: { dark: '#7A180D', light: '#FFDCE2' },
        fields: [
          { id: 'visualizingCareer', label: 'Visualizing Your Career', placeholder: 'Imagine yourself in your ideal job setting. What are you doing? Who are you working with? What accomplishments are you most proud of in this vision?', multiline: true },
          { id: 'reflectingOnEducation', label: 'Reflecting on Education', placeholder: 'Shift your focus to your educational goals. Picture yourself achieving your next educational milestone. What knowledge are you acquiring? How does it feel to learn and grow in this area?', multiline: true },
          { id: 'exploringPersonalGrowth', label: 'Exploring Personal Growth', placeholder: 'Think about the personal qualities you wish to develop. Envision yourself embodying these qualities. What activities are you engaging in that contribute to your personal growth?', multiline: true },
          { id: 'integrationAndGratitude', label: 'Integration and Gratitude', placeholder: 'Imagine bringing all these aspects together into a harmonious whole. Feel a sense of gratitude for your current achievements and excitement for the potential to reach these envisioned goals.', multiline: true },
          { id: 'postReflection', label: 'Post-Reflection Exercise', placeholder: 'Spend a few minutes writing down any insights, ideas, or feelings that arose during the visualization. Note any specific goals that felt particularly important to you, and think about what first steps you might take towards achieving them.', multiline: true },
        ],
      },
      {
        id: 'values',
        section: 'Personal Drivers',
        title: 'Values',
        label: 'Values',
        info: 'Understanding your core values helps you make decisions that align with your true self and speak your authentic truth. Choose up to 16 values, then star the top 3.',
        type: 'multiSelect',
        icon: Sparkles,
        color: { dark: '#6F240A', light: '#FED7AA' },
        optionSections: [
          { title: 'Well-Being', options: ['Adventure', 'Fun', 'Freedom', 'Growth', 'Happiness', 'Humor', 'Optimism', 'Passion', 'Peace', 'Pleasure'] },
          { title: 'Personal Qualities', options: ['Authenticity', 'Creativity', 'Curiosity', 'Honesty', 'Hopeful', 'Integrity', 'Mindfulness', 'Openness', 'Patience', 'Perseverance', 'Responsibility', 'Self-Discipline', 'Wisdom'] },
          { title: 'Social & Cultural Values', options: ['Diversity', 'Justice', 'Respect', 'Responsibility', 'Stability'] },
          { title: 'Practical & Lifestyle Values', options: ['Security', 'Simplicity', 'Stability', 'Wealth', 'Work-Life Balance', 'Sustainability', 'Community', 'Flexibility', 'Creativity'] },
          { title: 'Career & Achievements', options: ['Achievement', 'Challenge', 'Empowerment', 'Excellence', 'Influence', 'Innovation', 'Leadership', 'Learning', 'Success'] },
          { title: 'Interpersonal Relationships', options: ['Compassion', 'Dependability', 'Friendship', 'Generosity', 'Kindness', 'Love', 'Loyalty', 'Respect', 'Service', 'Teamwork', 'Trust'] },
        ],
        fields: [],
      },
      {
        id: 'culture',
        section: 'Personal Drivers',
        title: 'Culture',
        label: 'Culture',
        info: 'Reflect on the creative, everyday, digital, community, and family traditions that shape identity and belonging.',
        icon: UsersRound,
        color: { dark: '#5F230D', light: '#FDE68A' },
        fields: [
          { id: 'musicAndArt', section: 'Creative Ways You Express Yourself', label: 'Music and Art', placeholder: 'How do you use music and art to show who you are or connect with your culture?', multiline: true },
          { id: 'fashionAndLanguage', section: 'Creative Ways You Express Yourself', label: 'Fashion and Language', placeholder: 'How do your style choices and the words you use speak about your identity?', multiline: true },
          { id: 'foodAndFaith', section: 'Everyday Life and Beliefs', label: 'Food and Faith', placeholder: 'What are some foods you eat or beliefs you hold that reflect your cultural or family traditions?', multiline: true },
          { id: 'caringForThePlanet', section: 'Everyday Life and Beliefs', label: 'Caring for the Planet', placeholder: 'How do you and your family/community practice being good to the environment?', multiline: true },
          { id: 'socialMediaAndTech', section: 'Connecting Digitally and in Your Community', label: 'Social Media and Tech', placeholder: 'How do you use social media or technology to stay connected with friends or learn new things?', multiline: true },
          { id: 'communityAndViews', section: 'Connecting Digitally and in Your Community', label: 'Community and Views', placeholder: 'What are some ways you participate in your community or express your opinions?', multiline: true },
          { id: 'placesAndLearning', section: 'Your Personal Roots and Traditions', label: 'Places and Learning', placeholder: 'How does where you live or go to school influence who you are?', multiline: true },
          { id: 'holidaysAndFamilyTraditions', section: 'Your Personal Roots and Traditions', label: 'Holidays and Family Traditions', placeholder: 'What are special celebrations or rituals that mean a lot to your family?', multiline: true },
        ],
      },
      {
        id: 'mind',
        section: 'Personal Operating System',
        title: 'Mind - Cognitive Processing',
        label: 'Mind - cognitive processing',
        info: 'Rate how this person processes information, uses cognitive skills, and applies cognitive control.',
        type: 'rating',
        icon: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.mind.icon,
        color: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.mind.color,
        fields: [
          { id: 'informationProcessing', label: 'Information Processing', subtitle: 'Memory, attention, perception', placeholder: 'Rate information processing.' },
          { id: 'cognitiveSkills', label: 'Cognitive Skills', subtitle: 'Language, reasoning, decision making', placeholder: 'Rate cognitive skills.' },
          { id: 'cognitiveControl', label: 'Cognitive Control', subtitle: 'Executive function, regulation, flexibility', placeholder: 'Rate cognitive control.' },
        ],
      },
      {
        id: 'mind-learning-styles',
        section: 'Personal Operating System',
        title: 'Mind - Learning Styles',
        label: 'Mind - learning styles',
        info: 'Reflect on how you learn best and note your preferred way of learning and absorbing information.',
        type: 'singleChoice',
        icon: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.mind.icon,
        color: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.mind.color,
        options: [
          { id: 'visual', label: 'Visual Learning', description: 'Learn best by watching videos or looking at pictures.' },
          { id: 'auditory', label: 'Auditory Learning', description: 'Remember information better when I hear it.' },
          { id: 'kinesthetic', label: 'Kinesthetic Learning', description: 'Prefer to learn by doing activities or making things.' },
          { id: 'reading-writing', label: 'Reading/Writing Learning', description: 'Enjoy reading and writing activities.' },
        ],
        fields: [],
      },
      {
        id: 'mind-creativity',
        section: 'Personal Operating System',
        title: 'Mind - Creativity',
        label: 'Mind - creativity',
        info: 'Rate the types of creativity that come most naturally to you.',
        type: 'rating',
        icon: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.mind.icon,
        color: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.mind.color,
        fields: [
          { id: 'comingUpWithCoolIdeas', label: 'Coming Up with Cool Ideas', subtitle: 'Imagination, originality, fluency', placeholder: 'Rate coming up with cool ideas.' },
          { id: 'developingAwesomeStuff', label: 'Developing Awesome Stuff', subtitle: 'Adaptable, elaboration, experimentation', placeholder: 'Rate developing awesome stuff.' },
          { id: 'solvingTrickyProblems', label: 'Solving Tricky Problems', subtitle: 'Problem-solving, risk-taking', placeholder: 'Rate solving tricky problems.' },
          { id: 'expressingYourselfCreatively', label: 'Expressing Yourself Creatively', subtitle: 'Emotional expression, playfulness', placeholder: 'Rate expressing yourself creatively.' },
        ],
      },
      {
        id: 'mind-focus-concentration',
        section: 'Personal Operating System',
        title: 'Mind - Focus and Concentration',
        label: 'Mind - focus and concentration',
        info: 'Rate how well these focus and concentration areas function for you.',
        type: 'rating',
        icon: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.mind.icon,
        color: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.mind.color,
        fields: [
          { id: 'taskManagement', label: 'Task Management', subtitle: 'Organizing, prioritizing', placeholder: 'Rate task management.' },
          { id: 'attentionManagement', label: 'Attention Management', subtitle: 'Sustained focus, ignoring distractions, juggling tasks', placeholder: 'Rate attention management.' },
          { id: 'selfRegulation', label: 'Self-Regulation', subtitle: 'Shifting focus, regulating thoughts, emotions, and behaviors', placeholder: 'Rate self-regulation.' },
          { id: 'mindfulnessStamina', label: 'Mindfulness & Stamina', subtitle: 'Present-moment awareness, sustained mental effort', placeholder: 'Rate mindfulness and stamina.' },
          { id: 'optimalPerformance', label: 'Optimal Performance', subtitle: 'Performance, concentration, getting in the zone', placeholder: 'Rate optimal performance.' },
        ],
      },
      {
        id: 'mind-emotional-regulation',
        section: 'Personal Operating System',
        title: 'Mind - Emotional Regulation',
        label: 'Mind - emotional regulation',
        info: 'Choose the current regulation baselines that describe you best, then star the top 3.',
        type: 'multiSelect',
        icon: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.mind.icon,
        color: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.mind.color,
        optionSections: [
          { title: 'Stay in Control', options: ['Keep Your Cool', 'Choose Wisely', 'Adapt and Adjust', 'Lose Your Composure', 'Act Impulsively', 'Stay Stuck'] },
          { title: 'Handle Emotions', options: ['Acknowledge Emotions', 'Manage Intensity', 'Recover Quickly', 'Ignore Emotions', 'Overwhelm', 'Dwell On Difficulties'] },
          { title: 'Stay on Task', options: ['Maintain Focus', 'Follow Through', 'Persist in Challenges', 'Sidetracked', 'Postpone Efforts', 'Quit Early'] },
          { title: 'Be Mindful', options: ['Be Present', 'Reflect Thoughtfully', 'Tune In', 'Disconnect', 'React Hastily', 'Ignore Inner Signals'] },
          { title: 'Manage Stress', options: ['Handle Pressure', 'Practice Self-Care', 'Achieve Balance', 'Crumble Under Stress', 'Neglect Well-Being', 'Lose Equilibrium'] },
        ],
        fields: [],
      },
      {
        id: 'body',
        section: 'Personal Operating System',
        title: 'Body - Physical Health',
        label: 'Body - physical health',
        info: 'Write a reflection under each area of how you can support your physical health to reach its optimal zone more consistently.',
        icon: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.body.icon,
        color: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.body.color,
        fields: [
          { id: 'bodyMovement', label: 'Body Movement', placeholder: 'How can you support body movement more consistently?', multiline: true },
          { id: 'sleepHygieneRest', label: 'Sleep Hygiene & Rest', placeholder: 'How can you support sleep hygiene and rest more consistently?', multiline: true },
          { id: 'hydrationMaintenance', label: 'Hydration Maintenance', placeholder: 'How can you support hydration maintenance more consistently?', multiline: true },
          { id: 'nutritionManagement', label: 'Nutrition Management', placeholder: 'How can you support nutrition management more consistently?', multiline: true },
          { id: 'medicalCheckUps', label: 'Medical Check-Ups', placeholder: 'How can you support medical check-ups more consistently?', multiline: true },
        ],
      },
      {
        id: 'body-holistic-well-being',
        section: 'Personal Operating System',
        title: 'Body - Holistic Well-Being',
        label: 'Body - holistic well-being',
        info: 'Rate your current scale color for each area of holistic well-being.',
        type: 'rating',
        icon: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.body.icon,
        color: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.body.color,
        fields: [
          { id: 'stressMastery', label: 'Stress Mastery', subtitle: 'Deep breathing, regular breaks, journaling or talking to a friend', placeholder: 'Rate stress mastery.' },
          { id: 'zenZonePractices', label: 'Zen Zone Practices', subtitle: 'Yoga or relaxation, meditation, mindful walks in nature', placeholder: 'Rate zen zone practices.' },
          { id: 'physicalEnvironment', label: 'Physical Environment', subtitle: 'Decluttering, comfortable study/work area, green outdoor spaces', placeholder: 'Rate physical environment.' },
          { id: 'sensoryAwareness', label: 'Sensory Awareness', subtitle: 'Fatigue or burnout signs, quiet spaces, calming music or nature sounds', placeholder: 'Rate sensory awareness.' },
          { id: 'selfCarePractices', label: 'Self-Care Practices', subtitle: 'Sleep schedule, regular exercise, positive self-talk', placeholder: 'Rate self-care practices.' },
        ],
      },
      {
        id: 'inner-compass',
        section: 'Personal Operating System',
        title: 'Inner Compass - Inner Strengths',
        label: 'Inner Compass - inner strengths',
        info: 'Inner strengths are the positive qualities, attributes, and capabilities that reside within an individual. These qualities often contribute to resilience, well-being, and personal growth.',
        icon: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.innerCompass.icon,
        color: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.innerCompass.color,
        fields: [
          { id: 'defineInnerStrength', label: 'Defining Inner Strength', placeholder: 'How do you define inner strength, and why do you think it is important?', multiline: true },
          { id: 'meaningAndPurpose', label: 'Meaning and Purpose', placeholder: 'Reflect on what gives your life meaning and purpose. How do your inner strengths contribute to living a fulfilling life aligned with your values?', multiline: true },
          { id: 'challengeResponse', label: 'Challenge Response', placeholder: 'Describe a personal challenge or obstacle you have faced recently. How did you respond, and what inner strengths did you rely on?', multiline: true },
        ],
      },
      {
        id: 'inner-compass-decision-making',
        section: 'Personal Operating System',
        title: 'Inner Compass - Decision Making',
        label: 'Inner Compass - decision making',
        info: 'Decision making is the strategic process of selecting the most favorable course of action aligned with one\'s values and objectives, based on gathered information and evaluated alternatives.',
        icon: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.innerCompass.icon,
        color: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.innerCompass.color,
        fields: [
          { id: 'recentImportantDecision', label: 'Recent Important Decision', placeholder: 'Reflect on a recent important decision you made. How did you ensure it aligned with your values and objectives?', multiline: true },
          { id: 'decisionValues', label: 'Decision Values', placeholder: 'What values are most important to you when making decisions, and how do they influence your choices?', multiline: true },
          { id: 'evaluatingAlternatives', label: 'Evaluating Alternatives', placeholder: 'How do you evaluate alternatives when making decisions? Are there specific criteria you use to assess their alignment with your values and objectives?', multiline: true },
        ],
      },
      {
        id: 'inner-compass-intuition',
        section: 'Personal Operating System',
        title: 'Inner Compass - Intuition',
        label: 'Inner Compass - intuition',
        info: 'Intuition and inner wisdom are our inherent guides, rooted in gut feelings and instincts. They provide invaluable insights, aiding decision-making and navigating life\'s twists with clarity and assurance.',
        icon: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.innerCompass.icon,
        color: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.innerCompass.color,
        fields: [
          { id: 'intuitionOutcome', label: 'Intuition Outcome', placeholder: 'Reflect on a time you followed your intuition and it led you to a positive or negative outcome?', multiline: true },
          { id: 'distinguishingIntuition', label: 'Distinguishing Intuition', placeholder: 'How do you distinguish between intuition and other thoughts or emotions?', multiline: true },
          { id: 'currentDecisionIntuition', label: 'Current Decision Intuition', placeholder: 'Think about a decision you are currently facing. What is your intuition telling you about it?', multiline: true },
        ],
      },
      {
        id: 'inner-compass-life-direction',
        section: 'Personal Operating System',
        title: 'Inner Compass - Life Direction',
        label: 'Inner Compass - life direction',
        info: 'Life Direction involves reflecting on passions, interests, and aspirations to forge an authentic path toward a fulfilling future, guiding actions with clarity and purpose.',
        icon: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.innerCompass.icon,
        color: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.innerCompass.color,
        fields: [
          { id: 'excitementAndFulfillment', label: 'Excitement and Fulfillment', placeholder: 'What activities or pursuits ignite a sense of excitement and fulfillment within you?', multiline: true },
          { id: 'idealFuture', label: 'Ideal Future', placeholder: 'Envision your ideal future. What does it look like in terms of career, relationships, lifestyle, and personal growth?', multiline: true },
          { id: 'passionateCause', label: 'Passionate Cause', placeholder: 'Is there a particular cause or issue that you feel deeply passionate about?', multiline: true },
        ],
      },
      {
        id: 'inner-compass-beliefs',
        section: 'Personal Operating System',
        title: 'Inner Compass - Beliefs',
        label: 'Inner Compass - beliefs',
        info: 'Core beliefs are a person\'s most central ideas about themselves, others, and the world. These beliefs act like a lens through which every situation and life experience is seen.',
        icon: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.innerCompass.icon,
        color: PERSONAL_OPERATING_SYSTEM_CARD_STYLES.innerCompass.color,
        fields: [
          { id: 'selfBeliefs', label: 'Self Beliefs', placeholder: 'What are some beliefs you hold about yourself, both positive and negative?', multiline: true },
          { id: 'shapingBelief', label: 'Shaping Belief', placeholder: 'Consider a belief that has shaped your life significantly. How does it impact your decisions and actions?', multiline: true },
          { id: 'futureBeliefs', label: 'Future Beliefs', placeholder: 'What beliefs do you hold about your dreams and aspirations for the future?', multiline: true },
        ],
      },
      {
        id: 'executive-function',
        section: 'Skills',
        title: 'Executive Function',
        label: 'Executive function',
        info: 'Rate each area from 1 (low) to 5 (high), giving a baseline to identify strengths and areas for growth.',
        type: 'rating',
        icon: Lightbulb,
        color: { dark: '#075985', light: '#BAE6FD' },
        fields: [
          { id: 'workingMemory', section: 'Navigating Daily Life', label: 'Working Memory', subtitle: 'Remembering and recalling information for day-to-day tasks.', placeholder: 'Rate working memory.' },
          { id: 'organization', section: 'Navigating Daily Life', label: 'Organization', subtitle: 'Structuring spaces and thoughts to enhance focus and efficiency.', placeholder: 'Rate organization.' },
          { id: 'planning', section: 'Navigating Daily Life', label: 'Planning', subtitle: 'Outlining steps and setting timelines to achieve daily goals.', placeholder: 'Rate planning.' },
          { id: 'taskInitiation', section: 'Navigating Daily Life', label: 'Task Initiation', subtitle: 'Starting activities on time to maintain progress and productivity.', placeholder: 'Rate task initiation.' },
          { id: 'prioritizing', section: 'Making Smart Choices', label: 'Prioritizing', subtitle: 'Selecting which tasks to address first based on their importance.', placeholder: 'Rate prioritizing.' },
          { id: 'criticalDecisionMaking', section: 'Making Smart Choices', label: 'Critical Decision-Making', subtitle: 'Assessing options to make informed and optimal choices.', placeholder: 'Rate critical decision-making.' },
          { id: 'problemSolving', section: 'Making Smart Choices', label: 'Problem Solving', subtitle: 'Developing solutions for unexpected and complex challenges.', placeholder: 'Rate problem solving.' },
          { id: 'emotionalSelfRegulation', section: 'Mastering Self-Control', label: 'Emotional Self-Regulation', subtitle: 'Managing emotions to stay composed under pressure.', placeholder: 'Rate emotional self-regulation.' },
          { id: 'impulseControl', section: 'Mastering Self-Control', label: 'Impulse Control', subtitle: 'Focusing on long-term objectives while resisting short-term distractions.', placeholder: 'Rate impulse control.' },
        ],
      },
      {
        id: 'daily-living',
        section: 'Skills',
        title: 'Daily Living',
        label: 'Daily living',
        info: 'Rate each area from 1 (low) to 5 (high), giving a baseline to identify strengths and areas for growth.',
        type: 'rating',
        icon: Home,
        color: { dark: '#065F46', light: '#BBF7D0' },
        fields: [
          { id: 'timeManagement', section: 'Personal Management', label: 'Time Management', subtitle: 'Prioritizing and allocating time and responsibilities.', placeholder: 'Rate time management.' },
          { id: 'stressManagement', section: 'Personal Management', label: 'Stress Management', subtitle: 'Developing strategies and maintaining well-being.', placeholder: 'Rate stress management.' },
          { id: 'physicalSelfCare', section: 'Personal Management', label: 'Physical Self Care', subtitle: 'Prioritizing health through exercise, sleep, and hygiene.', placeholder: 'Rate physical self care.' },
          { id: 'emotionalResilience', section: 'Personal Management', label: 'Emotional Resilience', subtitle: 'Building skills to maintain emotional balance.', placeholder: 'Rate emotional resilience.' },
          { id: 'takingCareOfHome', section: 'Home and Financial Responsibility', label: 'Taking Care of Home', subtitle: 'Maintaining cleanliness in your living space.', placeholder: 'Rate taking care of home.' },
          { id: 'managingFinance', section: 'Home and Financial Responsibility', label: 'Managing Finance', subtitle: 'Budgeting, saving, handling money responsibly.', placeholder: 'Rate managing finance.' },
          { id: 'foodMealPlanning', section: 'Home and Financial Responsibility', label: 'Food/Meal Planning', subtitle: 'Preparing nutritious meals and shopping.', placeholder: 'Rate food and meal planning.' },
          { id: 'resourceManagement', section: 'Home and Financial Responsibility', label: 'Resource Management', subtitle: 'Conserving water, energy, and other supplies.', placeholder: 'Rate resource management.' },
          { id: 'transportation', section: 'Navigating Modern Life', label: 'Transportation', subtitle: 'Using public transport and vehicle maintenance.', placeholder: 'Rate transportation.' },
          { id: 'medicalManagement', section: 'Navigating Modern Life', label: 'Medical Management', subtitle: 'Managing and following medical needs.', placeholder: 'Rate medical management.' },
          { id: 'technologySocialMedia', section: 'Navigating Modern Life', label: 'Technology/Social Media', subtitle: 'Safely using digital tools and cyber security.', placeholder: 'Rate technology and social media.' },
          { id: 'communityEngagement', section: 'Navigating Modern Life', label: 'Community Engagement', subtitle: 'Participating in community activities and civic responsibilities.', placeholder: 'Rate community engagement.' },
        ],
      },
      {
        id: 'relational',
        section: 'Skills',
        title: 'Relational',
        label: 'Relational',
        info: 'Rate each area from 1 (low) to 5 (high), giving a baseline to identify strengths and areas for growth.',
        type: 'rating',
        icon: MessageCircle,
        color: { dark: '#1E40AF', light: '#BFDBFE' },
        fields: [
          { id: 'listeningSkills', section: 'Communication Skills', label: 'Listening Skills', subtitle: 'Actively understanding what others say.', placeholder: 'Rate listening skills.' },
          { id: 'verbalCommunication', section: 'Communication Skills', label: 'Verbal Communication', subtitle: 'Expressing ideas effectively using words.', placeholder: 'Rate verbal communication.' },
          { id: 'nonVerbalCommunication', section: 'Communication Skills', label: 'Non-Verbal Communication', subtitle: 'Conveying messages through body language, facial expressions, and gestures.', placeholder: 'Rate non-verbal communication.' },
          { id: 'empathy', section: 'Collaboration and Teamwork', label: 'Empathy', subtitle: 'Understanding and sharing the feelings of others to build deeper connections.', placeholder: 'Rate empathy.' },
          { id: 'honesty', section: 'Collaboration and Teamwork', label: 'Honesty', subtitle: 'Communicating truthfully and transparently in all interactions.', placeholder: 'Rate honesty.' },
          { id: 'integrity', section: 'Collaboration and Teamwork', label: 'Integrity', subtitle: 'Upholding moral and ethical standards consistently in relationships.', placeholder: 'Rate integrity.' },
          { id: 'culturalAwareness', section: 'Social and Cross-Cultural Skills', label: 'Cultural Awareness', subtitle: 'Recognizing and respecting differences in customs, values, and traditions.', placeholder: 'Rate cultural awareness.' },
          { id: 'inclusivity', section: 'Social and Cross-Cultural Skills', label: 'Inclusivity', subtitle: 'Ensuring all individuals feel valued and included regardless of background.', placeholder: 'Rate inclusivity.' },
          { id: 'adaptability', section: 'Social and Cross-Cultural Skills', label: 'Adaptability', subtitle: 'Adjusting behavior and communication to suit various social and cultural contexts.', placeholder: 'Rate adaptability.' },
        ],
      },
      {
        id: 'twenty-first-century',
        section: 'Skills',
        title: '21st Century',
        label: '21st century',
        info: 'Interest-Based Skills are cultivated through hobbies and personal interests, reflecting passions as well as unique talents and proficiencies developed through exploration and enjoyment.',
        icon: Feather,
        color: { dark: '#4C1D95', light: '#DDD6FE' },
        fields: [
          { id: 'hobbiesAndSkills', label: 'Hobbies and unique skills', placeholder: 'Reflect on three hobbies or personal interests you enjoy. How have these activities helped you develop unique skills or talents?', multiline: true },
          { id: 'joyAndDevelopment', label: 'Joy and development', placeholder: 'Reflect on the importance of pursuing activities that bring you joy and fulfillment. How do these interests contribute to your overall well-being and personal development?', multiline: true },
          { id: 'outerWorldSupport', label: 'Supporting other skill building', placeholder: 'Reflect on how your interest-based skills support other important OUTER WORLD skill building.', multiline: true },
        ],
      },
      {
        id: 'academic',
        section: 'Skills',
        title: 'Academic',
        label: 'Academic',
        info: 'Rate each area from 1 (low) to 5 (high), giving a baseline to identify strengths and areas for growth.',
        type: 'rating',
        icon: GraduationCap,
        color: { dark: '#1E3A8A', light: '#DBEAFE' },
        fields: [
          { id: 'numeracy', section: 'Critical Thinking and Problem Solving', label: 'Numeracy', subtitle: 'Analyzing and solving mathematical problems accurately.', placeholder: 'Rate numeracy.' },
          { id: 'reading', section: 'Critical Thinking and Problem Solving', label: 'Reading', subtitle: 'Interpreting and critically evaluating written material.', placeholder: 'Rate reading.' },
          { id: 'studySkills', section: 'Critical Thinking and Problem Solving', label: 'Study Skills', subtitle: 'Applying logical thinking to learn and retain information effectively.', placeholder: 'Rate study skills.' },
          { id: 'writing', section: 'Communication Skills', label: 'Writing', subtitle: 'Crafting clear and coherent written messages.', placeholder: 'Rate writing.' },
          { id: 'publicSpeaking', section: 'Communication Skills', label: 'Public Speaking', subtitle: 'Delivering presentations and speaking confidently in front of audiences.', placeholder: 'Rate public speaking.' },
          { id: 'noteTaking', section: 'Communication Skills', label: 'Note-Taking', subtitle: 'Summarizing information concisely during lectures and meetings.', placeholder: 'Rate note-taking.' },
          { id: 'computerUse', section: 'ICT (Information, Communications, and Technology) Literacy', label: 'Computer Use', subtitle: 'Operating and troubleshooting basic computer functions.', placeholder: 'Rate computer use.' },
          { id: 'technologyAdaptation', section: 'ICT (Information, Communications, and Technology) Literacy', label: 'Technology Adaptation', subtitle: 'Quickly learning and integrating new digital tools and platforms.', placeholder: 'Rate technology adaptation.' },
          { id: 'cybersecurityAwareness', section: 'ICT (Information, Communications, and Technology) Literacy', label: 'Cybersecurity Awareness', subtitle: 'Understanding and applying measures to protect online information.', placeholder: 'Rate cybersecurity awareness.' },
        ],
      },
    ],
  },
  {
    id: 'lifestyle',
    title: 'Lifestyle',
    label: 'Lifestyle canvas',
    description: 'Map rhythms, preferences, energy patterns, and everyday constraints.',
    icon: HeartPulse,
    cards: [{
      id: 'lifestyle-rhythm',
      title: 'Lifestyle Rhythm',
      label: 'Lifestyle rhythm',
      info: 'Use this card to record the shape of ordinary life: routines, energy, environments, and the practical details that help this person thrive.',
      icon: HeartPulse,
      color: { dark: '#881337', light: '#FECDD3' },
      fields: [
        { id: 'dailyRhythm', label: 'What does a good rhythm look like?', placeholder: 'Mornings for deep work, afternoons for calls...', multiline: true },
        { id: 'supportNeeds', label: 'What support or constraints matter?', placeholder: 'Boundaries, accessibility, schedule, focus needs...' },
      ],
    }],
  },
  {
    id: 'navigation',
    title: 'Navigation',
    label: 'Navigation canvas',
    description: 'Track priorities, decision cues, next steps, and what helps them move forward.',
    icon: Compass,
    cards: [{
      id: 'navigation-compass',
      title: 'Navigation Compass',
      label: 'Navigation compass',
      info: 'Use this card to capture how this person chooses direction: current priorities, decisions ahead, and the signals that help them orient.',
      icon: Mountain,
      color: { dark: '#0A514D', light: '#99F6E4' },
      fields: [
        { id: 'currentPriority', label: 'What is the current priority?', placeholder: 'The main thing they are navigating right now.', multiline: true },
        { id: 'decisionSignal', label: 'What signals a good next step?', placeholder: 'Values, metrics, people, deadlines, or feelings.' },
      ],
    }],
  },
]
