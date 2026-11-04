import {
  ArrowDownLeft, ArrowUpRight, Award, Bike, BookOpen, Briefcase, Building, Bus, Car, Dumbbell, Flag, Fuel, GraduationCap, HandCoins,
  Heart, HeartPulse, Layers, ShoppingBag, TriangleAlert, House, HouseHeart, Landmark, Medal, Music, Package, Palette, PawPrint, Pencil, PiggyBank, Plane, Play, Plug,
  Receipt, Repeat, SlidersHorizontal, Shield, Shirt, ShoppingCart, Smartphone, Sparkles, Square, Tag, Ticket, Users, Utensils, Wrench, type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  'arrow-down-left': ArrowDownLeft, 'arrow-up-right': ArrowUpRight, award: Award, bike: Bike, 'book-open': BookOpen, briefcase: Briefcase,
  building: Building, bus: Bus, car: Car, dumbbell: Dumbbell, flag: Flag, fuel: Fuel, 'graduation-cap': GraduationCap, 'hand-coins': HandCoins,
  heart: Heart, 'heart-pulse': HeartPulse, house: House, 'house-heart': HouseHeart, landmark: Landmark, medal: Medal, music: Music,
  package: Package, palette: Palette, 'paw-print': PawPrint, pencil: Pencil, 'piggy-bank': PiggyBank, plane: Plane, play: Play, plug: Plug,
  receipt: Receipt, repeat: Repeat, shield: Shield, shirt: Shirt, sliders: SlidersHorizontal, 'shopping-cart': ShoppingCart, smartphone: Smartphone, sparkles: Sparkles,
  square: Square, layers: Layers, 'shopping-bag': ShoppingBag, 'triangle-alert': TriangleAlert, tag: Tag, ticket: Ticket, users: Users, utensils: Utensils, wrench: Wrench,
}

export function LifeIcon({ name, className = 'size-4' }: { name?: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || Pencil
  return <Icon className={className} aria-hidden="true" />
}
