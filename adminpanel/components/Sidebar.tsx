'use client'
import { useState } from 'react'
import React from 'react'
import { 
  Users, 
  Calendar, 
  CreditCard, 
  FileText, 
  Settings, 
  BarChart3,
  UserCheck,
  Music,
  Ticket,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Building2,
  Image,
  Tag
} from 'lucide-react'

const menuItems = [
  { icon: BarChart3, label: 'Dashboard', href: '/dashboard' },
  { 
    icon: Users, 
    label: 'User Management', 
    href: '/users',
    hasDropdown: true,
    subItems: [
      { icon: Users, label: 'All Users', href: '/users' },
      { icon: Music, label: 'Artists', href: '/artists' },
      { icon: Building2, label: 'Organizers', href: '/organizers' }
    ]
  },
  { icon: Calendar, label: 'Event Management', href: '/events' },
  { icon: Ticket, label: 'Ticketing & Finance', href: '/finance' },
  { icon: FileText, label: 'Content Management', href: '/content' },
  { 
    icon: Image, 
    label: 'Banner/Ads Manager', 
    href: '/banners',
    hasDropdown: true,
    subItems: [
      { icon: Image, label: 'Homepage Banners', href: '/banners' },
      { icon: CreditCard, label: 'Sponsored Ads', href: '/ads' }
    ]
  },
  { 
    icon: Tag, 
    label: 'Category Manager', 
    href: '/categories',
    hasDropdown: true,
    subItems: [
      { icon: Tag, label: 'Main Categories', href: '/categories/main' },
      { icon: Music, label: 'Event Types', href: '/categories/events' },
      { icon: Users, label: 'Artist Genres', href: '/categories/artists' },
      { icon: Building2, label: 'Organizer Types', href: '/categories/organizers' }
    ]
  },
  { icon: Settings, label: 'Master Settings', href: '/settings' },
]

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [activeItem, setActiveItem] = useState('')
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  
  // Set active item based on current URL
  React.useEffect(() => {
    const path = window.location.pathname
    if (path === '/' || path === '/dashboard') setActiveItem('Dashboard')
    else if (path === '/users') setActiveItem('All Users')
    else if (path === '/artists') setActiveItem('Artists')
    else if (path === '/organizers') setActiveItem('Organizers')
    else if (path === '/events') setActiveItem('Event Management')
    else if (path === '/finance') setActiveItem('Ticketing & Finance')
    else if (path === '/content') setActiveItem('Content Management')
    else if (path === '/banners') setActiveItem('Homepage Banners')
    else if (path === '/ads') setActiveItem('Sponsored Ads')
    else if (path === '/categories/main') setActiveItem('Main Categories')
    else if (path === '/categories/events') setActiveItem('Event Types')
    else if (path === '/categories/artists') setActiveItem('Artist Genres')
    else if (path === '/categories/organizers') setActiveItem('Organizer Types')
    else if (path === '/settings') setActiveItem('Master Settings')
  }, [])

  return (
    <div className={`${isCollapsed ? 'w-16' : 'w-64'} bg-gradient-to-b from-deep-blue to-indigo h-screen fixed left-0 top-0 z-50 transition-all duration-300 shadow-2xl backdrop-blur-sm flex flex-col`}>
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          {!isCollapsed ? (
            <div className="flex items-center">
              <div>
                <h1 className="text-white text-2xl font-bold tracking-wide">Mookalaa</h1>
                <p className="text-white/70 text-sm font-medium">Admin Panel</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <img src="/logo.png" alt="Mookalla Logo" className="w-8 h-8 object-contain" />
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-white/70 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-all duration-200"
          >
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
      </div>

      {/* Menu Items */}
      <nav className="mt-6 flex-1 overflow-y-auto pb-20 scrollbar-hide">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = activeItem === item.label
          const isDropdownOpen = openDropdown === item.label
          
          return (
            <div key={item.label}>
              <button
                onMouseEnter={() => setHoveredItem(item.label)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => {
                  setActiveItem(item.label)
                  if (item.hasDropdown) {
                    setOpenDropdown(isDropdownOpen ? null : item.label)
                  } else {
                    window.location.href = item.href
                  }
                }}
                className={`w-full flex items-center justify-between px-6 py-4 text-left transition-all duration-300 group mr-2 ${
                  isActive 
                    ? 'bg-gradient-to-r from-emerald to-teal text-white shadow-lg transform translate-x-2 rounded-r-3xl border-r-4 border-white/30' 
                    : hoveredItem === item.label
                    ? 'text-white bg-gradient-to-r from-white/20 to-white/10 transform translate-x-1 shadow-lg backdrop-blur-sm rounded-r-3xl border-r-2 border-white/20'
                    : 'text-white/80 hover:text-white hover:bg-gradient-to-r hover:from-white/15 hover:to-white/5 hover:transform hover:translate-x-1 hover:shadow-md hover:backdrop-blur-sm hover:rounded-r-3xl hover:border-r-2 hover:border-white/10'
                }`}
              >
                <div className="flex items-center">
                  <Icon size={20} className={`${isActive ? 'text-white' : 'text-white/80 group-hover:text-white'} transition-all duration-200`} />
                  {!isCollapsed && (
                    <span className="ml-3 font-medium">{item.label}</span>
                  )}
                </div>
                {!isCollapsed && item.hasDropdown && (
                  <div className={`${isActive ? 'text-white' : 'text-white/80 group-hover:text-white'} transition-all duration-200`}>
                    {isDropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                )}
              </button>
              
              {/* Dropdown Items */}
              {!isCollapsed && item.hasDropdown && isDropdownOpen && (
                <div className="bg-white/5 backdrop-blur-sm rounded-r-xl mr-4 mt-1">
                  {item.subItems?.map((subItem) => {
                    const SubIcon = subItem.icon
                    return (
                      <button
                        key={subItem.label}
                        onMouseEnter={() => setHoveredItem(subItem.label)}
                        onMouseLeave={() => setHoveredItem(null)}
                        onClick={() => {
                          setActiveItem(subItem.label)
                          window.location.href = subItem.href
                        }}
                        className={`w-full flex items-center px-8 py-3 text-left transition-all duration-300 mr-2 ${
                          activeItem === subItem.label
                            ? 'bg-gradient-to-r from-emerald/40 to-emerald/20 text-white transform translate-x-1 shadow-lg backdrop-blur-sm rounded-r-2xl border-r-2 border-emerald/50'
                            : hoveredItem === subItem.label
                            ? 'text-white bg-gradient-to-r from-white/25 to-white/10 transform translate-x-1 shadow-md backdrop-blur-sm rounded-r-2xl border-r-2 border-white/30'
                            : 'text-white/70 hover:text-white hover:bg-gradient-to-r hover:from-white/20 hover:to-white/5 hover:transform hover:translate-x-1 hover:shadow-sm hover:backdrop-blur-sm hover:rounded-r-2xl hover:border-r-2 hover:border-white/20'
                        }`}
                      >
                        <SubIcon size={16} className={`mr-3 transition-all duration-200 ${
                          activeItem === subItem.label ? 'text-white' : 'text-white/70'
                        }`} />
                        <span className="text-sm">{subItem.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Bottom Profile */}
      {!isCollapsed && (
        <div className="absolute bottom-4 left-4 right-4 bg-gradient-to-b from-deep-blue to-indigo pt-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-gradient-to-r from-emerald to-teal rounded-full flex items-center justify-center shadow-lg">
                <span className="text-white text-sm font-bold">A</span>
              </div>
              <div className="ml-3">
                <p className="text-white text-sm font-semibold">Admin User</p>
                <p className="text-white/70 text-xs">Super Admin</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}