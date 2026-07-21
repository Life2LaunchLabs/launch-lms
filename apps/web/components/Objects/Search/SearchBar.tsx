import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, ArrowRight, Sparkles, BookCopy, SquareLibrary, ArrowUpRight, TextSearch, ScanSearch, Users, X, Building2, MessageCircle, Layers } from 'lucide-react';
import { searchOrgContent } from '@services/search/search';
import { useLHSession } from '@components/Contexts/LHSessionContext';
import Link from 'next/link';
import {
  getOrgLogoMediaDirectory,
  getOrgThumbnailMediaDirectory,
  getUserAvatarMediaDirectory,
} from '@services/media/media';
import { useDebounce } from '@/hooks/useDebounce';
import { useOrg } from '@components/Contexts/OrgContext';
import { getUriWithOrg, routePaths } from '@services/config/config';
import UserAvatar from '../UserAvatar';
import { useTranslation } from 'react-i18next';
import { useAnalytics } from '@/hooks/useAnalytics';
import { getMenuColorClasses } from '@services/utils/ts/colorUtils';
import { Z_INDEX } from '@/lib/z-index';
import { DiscoverOrganization } from '@services/organizations/orgs';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@components/ui/popover';

interface User {
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_image: string;
  bio: string;
  details: Record<string, any>;
  profile: Record<string, any>;
  id: number;
  user_uuid: string;
}

interface Author {
  user: User;
  authorship: string;
  authorship_status: string;
  creation_date: string;
  update_date: string;
}

interface Badge {
  name: string;
  description: string;
  about: string;
  thumbnail_image: string;
  public: boolean;
  id: number;
  org_id: number;
  badge_uuid: string;
  creation_date: string;
  update_date: string;
  owner_org_uuid?: string | null;
  owner_org_name?: string | null;
  is_shared_from_other_org?: boolean;
}

interface BadgeCollection {
  name: string;
  public: boolean;
  description: string;
  id: number;
  collection_uuid: string;
  creation_date: string;
  update_date: string;
}

interface Community {
  name: string;
  description: string | null;
  community_uuid: string;
  public: boolean;
  shared: boolean;
  thumbnail_image: string;
  org_id: number;
  owner_org_uuid?: string | null;
  is_shared_from_other_org?: boolean;
}

interface ResourceChannel {
  name: string;
  description: string | null;
  channel_uuid: string;
  public: boolean;
  shared: boolean;
  thumbnail_image: string | null;
  org_id: number;
  color: string | null;
  owner_org_uuid?: string | null;
  is_shared_from_other_org?: boolean;
}

interface SearchResults {
  badges: Badge[];
  badge_collections: BadgeCollection[];
  organizations: DiscoverOrganization[];
  communities: Community[];
  resource_channels: ResourceChannel[];
  users: User[];
}

interface SearchBarProps {
  orgslug: string;
  className?: string;
  isMobile?: boolean;
  isRail?: boolean;
  showSearchSuggestions?: boolean;
  primaryColor?: string;
}

const CourseResultsSkeleton = () => (
  <div className="p-2 ">
    <div className="flex items-center gap-2 px-2 py-2">
      <div className="w-4 h-4 bg-foreground/10 rounded animate-pulse" />
      <div className="w-20 h-4 bg-foreground/10 rounded animate-pulse" />
    </div>
    {[1, 2].map((i) => (
      <div key={i} className="flex items-center gap-3 p-2">
        <div className="w-10 h-10 bg-foreground/10 rounded-lg animate-pulse" />
        <div className="flex-1">
          <div className="w-48 h-4 bg-foreground/10 rounded animate-pulse mb-2" />
          <div className="w-32 h-4 bg-foreground/10 rounded animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

export const SearchBar: React.FC<SearchBarProps> = ({
  orgslug,
  className = '',
  isMobile = false,
  isRail = false,
  showSearchSuggestions = false,
  primaryColor = '',
}) => {
  const { t } = useTranslation();
  const org = useOrg() as any;
  const { track } = useAnalytics();
  const colors = getMenuColorClasses(primaryColor);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults>({
    badges: [],
    badge_collections: [],
    organizations: [],
    communities: [],
    resource_channels: [],
    users: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const session = useLHSession() as any;
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Debounce the search query value
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Focus input when mobile search expands
  useEffect(() => {
    if ((isMobile && mobileExpanded) || (isRail && railOpen)) {
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isMobile, isRail, mobileExpanded, railOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        searchRef.current && !searchRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchResults = async () => {
      if (debouncedSearch.trim().length === 0) {
        setSearchResults({ badges: [], badge_collections: [], organizations: [], communities: [], resource_channels: [], users: [] });
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const response = await searchOrgContent(
          orgslug,
          debouncedSearch,
          1,
          3,
          null,
          session?.data?.tokens?.access_token
        );

        // Type assertion and safe access
        const typedResponse = response.data as any;

        // Ensure we have the correct structure and handle potential undefined values
        const processedResults: SearchResults = {
          badges: Array.isArray(typedResponse?.badges) ? typedResponse.badges : [],
          badge_collections: Array.isArray(typedResponse?.badge_collections) ? typedResponse.badge_collections : [],
          organizations: Array.isArray(typedResponse?.organizations) ? typedResponse.organizations : [],
          communities: Array.isArray(typedResponse?.communities) ? typedResponse.communities : [],
          resource_channels: Array.isArray(typedResponse?.resource_channels) ? typedResponse.resource_channels : [],
          users: Array.isArray(typedResponse?.users) ? typedResponse.users : []
        };

        setSearchResults(processedResults);

        const totalResults = processedResults.badges.length + processedResults.badge_collections.length + processedResults.organizations.length + processedResults.communities.length + processedResults.resource_channels.length + processedResults.users.length;
        track('search_query', {
          query: debouncedSearch,
          results_count: totalResults,
        });
      } catch (error) {
        console.error('Error searching content:', error);
        setSearchResults({ badges: [], badge_collections: [], organizations: [], communities: [], resource_channels: [], users: [] });
      }
      setIsLoading(false);
      setIsInitialLoad(false);
    };

    fetchResults();
  }, [debouncedSearch, orgslug, session?.data?.tokens?.access_token]);

  const MemoizedEmptyState = useMemo(() => {
    if (!searchQuery.trim()) {
      return (
        <div className="py-8 px-4">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 p-3 bg-foreground/10 rounded-full">
              <Sparkles className="w-6 h-6 text-foreground/70" />
            </div>
            <h3 className="text-sm font-medium text-foreground/80 mb-1">
              {t('search.discover_next_journey')}
            </h3>
            <p className="text-xs text-foreground/50 max-w-[240px]">
              {t('search.start_typing_to_search')}
            </p>
          </div>
        </div>
      );
    }
    return null;
  }, [searchQuery, t]);

  const searchTerms = useMemo(() => [
    { term: searchQuery, type: 'exact', icon: <Search size={14} className="text-foreground/40" /> },
    { term: `${searchQuery} badges`, type: 'badges', icon: <BookCopy size={14} className="text-foreground/40" /> },
    { term: `${searchQuery} badge collections`, type: 'badge_collections', icon: <SquareLibrary size={14} className="text-foreground/40" /> },
    { term: `${searchQuery} organizations`, type: 'organizations', icon: <Building2 size={14} className="text-foreground/40" /> },
  ], [searchQuery]);

  const MemoizedSearchSuggestions = useMemo(() => {
    if (searchQuery.trim()) {
      return (
        <div className="p-2">
          <div className="flex items-center gap-2 px-2 py-2 text-sm text-foreground/50">
            <ScanSearch size={16} />
            <span className="font-medium">{t('search.search_suggestions')}</span>
          </div>
          <div className="space-y-1">
            {searchTerms.map(({ term, type, icon }) => (
              <Link
                key={`${term}-${type}`}
                href={getUriWithOrg(orgslug, routePaths.org.search(term))}
                className="flex items-center px-3 py-2 hover:bg-foreground/[0.02] rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-2 flex-1">
                  {icon}
                  <span className="text-sm text-foreground/70">{term}</span>
                </div>
                <ArrowUpRight size={14} className="text-foreground/30 group-hover:text-foreground/50 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      );
    }
    return null;
  }, [searchQuery, searchTerms, orgslug, t]);

  const MemoizedQuickResults = useMemo(() => {
    const hasResults = searchResults.badges.length > 0 ||
                      searchResults.badge_collections.length > 0 ||
                      searchResults.organizations.length > 0 ||
                      searchResults.communities.length > 0 ||
                      searchResults.resource_channels.length > 0 ||
                      searchResults.users.length > 0;

    if (!hasResults) return null;

    return (
      <div className="p-2">
        <div className="flex items-center gap-2 px-2 py-2 text-sm text-foreground/50">
          <TextSearch size={16} />
          <span className="font-medium">{t('search.quick_results')}</span>
        </div>

        {/* Badges Section */}
        {searchResults.badges.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-foreground/40">
              <BookCopy size={12} />
              <span>Badges</span>
            </div>
            {searchResults.badges.map((course) => (
              <Link
                key={course.badge_uuid}
                href={getUriWithOrg(orgslug, `/badges/${course.badge_uuid.replace('badge_', '')}`)}
                className="flex items-center gap-3 p-2 hover:bg-foreground/[0.02] rounded-lg transition-colors"
              >
                <div className="relative">
                  {course.thumbnail_image ? (
                    <img
                      src={course.thumbnail_image}
                      alt={course.name}
                      className="w-10 h-10 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-foreground/10 rounded-lg flex items-center justify-center">
                      <BookCopy size={20} className="text-foreground/40" />
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 bg-card shadow-sm p-1 rounded-full">
                    <BookCopy size={11} className="text-foreground/60" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground/80 truncate">{course.name}</h3>
                    <span className="text-[10px] font-medium text-foreground/40 uppercase tracking-wide whitespace-nowrap">Badge</span>
                  </div>
                  <p className="text-xs text-foreground/50 truncate">{course.description}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Badge collections section */}
        {searchResults.badge_collections.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-foreground/40">
              <SquareLibrary size={12} />
              <span>Badge collections</span>
            </div>
            {searchResults.badge_collections.map((collection) => (
              <Link
                key={collection.collection_uuid}
                href={getUriWithOrg(orgslug, `/badges?collection=${collection.collection_uuid}`)}
                className="flex items-center gap-3 p-2 hover:bg-foreground/[0.02] rounded-lg transition-colors"
              >
                <div className="w-10 h-10 bg-foreground/10 rounded-lg flex items-center justify-center">
                  <SquareLibrary size={20} className="text-foreground/40" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground/80 truncate">{collection.name}</h3>
                    <span className="text-[10px] font-medium text-foreground/40 uppercase tracking-wide whitespace-nowrap">Badge collection</span>
                  </div>
                  <p className="text-xs text-foreground/50 truncate">{collection.description}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {searchResults.communities.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-foreground/40">
              <MessageCircle size={12} />
              <span>Communities</span>
            </div>
            {searchResults.communities.map((community) => (
              <Link
                key={community.community_uuid}
                href={getUriWithOrg(orgslug, routePaths.org.community(community.community_uuid.replace('community_', '')))}
                className="flex items-center gap-3 p-2 hover:bg-foreground/[0.02] rounded-lg transition-colors"
              >
                <div className="w-10 h-10 bg-foreground/10 rounded-lg flex items-center justify-center">
                  <MessageCircle size={20} className="text-foreground/40" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground/80 truncate">{community.name}</h3>
                    <span className="text-[10px] font-medium text-foreground/40 uppercase tracking-wide whitespace-nowrap">community</span>
                  </div>
                  <p className="text-xs text-foreground/50 truncate">{community.description}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {searchResults.resource_channels.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-foreground/40">
              <Layers size={12} />
              <span>Resource Channels</span>
            </div>
            {searchResults.resource_channels.map((channel) => (
              <Link
                key={channel.channel_uuid}
                href={getUriWithOrg(orgslug, `/resources?channel=${encodeURIComponent(channel.channel_uuid)}`)}
                className="flex items-center gap-3 p-2 hover:bg-foreground/[0.02] rounded-lg transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: channel.color ? `${channel.color}20` : 'rgb(0,0,0,0.05)' }}
                >
                  <Layers size={20} style={{ color: channel.color || 'rgb(0,0,0,0.4)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground/80 truncate">{channel.name}</h3>
                    <span className="text-[10px] font-medium text-foreground/40 uppercase tracking-wide whitespace-nowrap">channel</span>
                  </div>
                  <p className="text-xs text-foreground/50 truncate">{channel.description}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {searchResults.organizations.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-foreground/40">
              <Building2 size={12} />
              <span>Organizations</span>
            </div>
            {searchResults.organizations.map((organization) => {
              const imageSrc = organization.thumbnail_image
                ? getOrgThumbnailMediaDirectory(organization.org_uuid, organization.thumbnail_image)
                : organization.logo_image
                  ? getOrgLogoMediaDirectory(organization.org_uuid, organization.logo_image)
                  : null

              return (
                <Link
                  key={organization.org_uuid}
                  href={getUriWithOrg(orgslug, routePaths.org.organization(organization.slug))}
                  className="flex items-center gap-3 p-2 hover:bg-foreground/[0.02] rounded-lg transition-colors"
                >
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt={organization.name}
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/10">
                      <Building2 size={20} className="text-foreground/40" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-medium text-foreground/80">{organization.name}</h3>
                      <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-foreground/40">organization</span>
                    </div>
                    <p className="truncate text-xs text-foreground/50">
                      {organization.description || organization.about || `@${organization.slug}`}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* Users Section */}
        {searchResults.users.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-foreground/40">
              <Users size={12} />
              <span>{t('common.users')}</span>
            </div>
            {searchResults.users.map((user) => (
              <Link
                key={user.user_uuid}
                href={getUriWithOrg(orgslug, routePaths.org.user(user.username))}
                className="flex items-center gap-3 p-2 hover:bg-foreground/[0.02] rounded-lg transition-colors"
              >
                <UserAvatar
                  width={40}
                  avatar_url={user.avatar_image ? getUserAvatarMediaDirectory(user.user_uuid, user.avatar_image) : ''}
                  predefined_avatar={user.avatar_image ? undefined : 'empty'}
                  userId={user.id.toString()}
                  showProfilePopup
                  rounded="rounded-full"
                  backgroundColor="bg-muted"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground/80 truncate">
                      {user.first_name} {user.last_name}
                    </h3>
                    <span className="text-[10px] font-medium text-foreground/40 uppercase tracking-wide whitespace-nowrap">{t('search.user')}</span>
                  </div>
                  <p className="text-xs text-foreground/50 truncate">@{user.username}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }, [searchResults, orgslug, org?.org_uuid, t]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setShowResults(true);
  }, []);

  const closeMobile = useCallback(() => {
    setMobileExpanded(false);
    setShowResults(false);
    setSearchQuery('');
  }, []);

  const closeRail = useCallback(() => {
    setRailOpen(false);
    setShowResults(false);
    setSearchQuery('');
  }, []);

  // Shared dropdown content (used by both desktop and mobile expanded)
  const dropdownContent = (!searchQuery.trim() || isInitialLoad) ? (
    MemoizedEmptyState
  ) : (
    <>
      {showSearchSuggestions && MemoizedSearchSuggestions}
      {isLoading ? (
        <CourseResultsSkeleton />
      ) : (
        <>
          {MemoizedQuickResults}
          {((searchResults.badges.length > 0 ||
             searchResults.badge_collections.length > 0 ||
             searchResults.organizations.length > 0 ||
             searchResults.communities.length > 0 ||
             searchResults.resource_channels.length > 0 ||
             searchResults.users.length > 0) ||
             searchQuery.trim()) && (
            <Link
              href={getUriWithOrg(orgslug, routePaths.org.search(searchQuery))}
              className="flex items-center justify-between px-4 py-2.5 text-xs text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.02] transition-colors"
            >
              <span>{t('search.view_all_results')}</span>
              <ArrowRight size={14} />
            </Link>
          )}
        </>
      )}
    </>
  );

  if (isRail) {
    return (
      <Popover open={railOpen} onOpenChange={(open) => {
        setRailOpen(open);
        if (open) {
          setShowResults(true);
        } else {
          setShowResults(false);
        }
      }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            aria-label={t('search.search_placeholder')}
          >
            <Search size={18} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={12}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="w-[420px] max-w-[calc(100vw-7rem)] max-h-[min(640px,calc(100vh-2rem))] overflow-hidden rounded-xl border border-border bg-card p-0 shadow-[0_20px_60px_rgba(15,23,42,0.18)]"
          style={{ zIndex: Z_INDEX.NAV_MENU + 1 }}
        >
          <div ref={searchRef} className="flex max-h-[inherit] flex-col">
            <div className="flex items-center gap-2 border-b border-border p-3">
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => setShowResults(true)}
                  aria-label={t('search.search_placeholder')}
                  placeholder={t('search.search_placeholder')}
                  className={`w-full h-10 pl-11 pr-4 rounded-xl focus:outline-none focus:ring-1 transition-all text-sm ${colors.searchBg}`}
                />
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Search className={`${colors.searchIcon} transition-colors`} size={18} />
                </div>
              </div>
              <button
                onClick={closeRail}
                className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${colors.iconBtn}`}
                aria-label="Close search"
              >
                <X size={18} />
              </button>
            </div>
            {showResults && (
              <div
                ref={dropdownRef}
                className="min-h-0 overflow-y-auto divide-y divide-black/5"
              >
                {dropdownContent}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // Mobile: icon-only button in the navbar, plus a portalled overlay when expanded.
  // We must portal the overlay to document.body to escape the navbar's backdrop-blur
  // containing block, which would otherwise confine fixed positioning to the navbar bounds.
  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setMobileExpanded(true)}
          className={`h-9 w-9 flex items-center justify-center rounded-xl ${colors.searchBg}`}
          aria-label={t('search.search_placeholder')}
        >
          <Search className={`${colors.searchIcon}`} size={18} />
        </button>

        {mobileExpanded && typeof document !== 'undefined' && createPortal(
          <>
            {/* Scrim — fixed relative to viewport (portalled out of navbar) */}
            <div
              className="fixed inset-0 bg-black/40"
              style={{ zIndex: Z_INDEX.NAV_MENU + 1 }}
              onClick={closeMobile}
            />

            {/* Expanded search bar — sits over the navbar */}
            <div
              ref={searchRef}
              className="fixed top-0 left-0 right-0 flex flex-col"
              style={{ zIndex: Z_INDEX.NAV_MENU + 2 }}
            >
              {/* Input row — matches navbar height */}
              <div
                className="flex items-center gap-2 px-4 h-[60px] shadow-sm"
                style={{ backgroundColor: primaryColor || 'white' }}
              >
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    onFocus={() => setShowResults(true)}
                    aria-label={t('search.search_placeholder')}
                    placeholder={t('search.search_placeholder')}
                    className={`w-full h-9 pl-11 pr-4 rounded-xl focus:outline-none focus:ring-1 transition-all text-sm ${colors.searchBg}`}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Search className={`${colors.searchIcon} transition-colors`} size={18} />
                  </div>
                </div>
                <button
                  onClick={closeMobile}
                  className={`flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${colors.iconBtn}`}
                  aria-label="Close search"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Dropdown — positioned below input row */}
              {showResults && (
                <div className="mx-4 mt-1 bg-card rounded-xl nice-shadow overflow-hidden divide-y divide-black/5">
                  {dropdownContent}
                </div>
              )}
            </div>
          </>,
          document.body
        )}
      </>
    );
  }

  const handleDesktopFocus = useCallback(() => {
    setShowResults(true);
    if (searchRef.current) {
      const rect = searchRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 8, left: rect.left, width: rect.width });
    }
  }, []);

  // Desktop: existing behaviour, but dropdown is portalled to escape overflow-hidden parents
  return (
    <div ref={searchRef} className={`relative ${className}`}>
      <div className="relative group">
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={handleDesktopFocus}
          aria-label={t('search.search_placeholder')}
          placeholder={t('search.search_placeholder')}
          className={`w-full h-9 pl-11 pr-4 rounded-xl
                     focus:outline-none focus:ring-1 transition-all text-sm
                     ${colors.searchBg}`}
        />
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search className={`${colors.searchIcon} transition-colors`} size={18} />
        </div>
      </div>

      {showResults && dropdownPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: Math.max(dropdownPos.width, 400),
            zIndex: Z_INDEX.NAV_MENU + 1,
          }}
          className="bg-card rounded-xl nice-shadow overflow-hidden divide-y divide-black/5"
        >
          {dropdownContent}
        </div>,
        document.body
      )}
    </div>
  );
};
