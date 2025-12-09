'use client'
import { useState, useEffect } from 'react'
import Sidebar from '../../components/Sidebar'
import { Tag, Plus, Edit2, Trash2, Bell, Search, ChevronDown, LogOut, User, Settings as SettingsIcon, X } from 'lucide-react'

interface SubCategory {
  name: string
}

interface Category {
  _id?: string
  name: string
  type: string
  subCategories: SubCategory[]
}

export default function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([])
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [categoryType, setCategoryType] = useState('')
  const [subCategories, setSubCategories] = useState<SubCategory[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories')
      const data = await res.json()
      setCategories(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch categories')
      setCategories([])
    }
  }

  const handleAddSubCategory = () => {
    setSubCategories([...subCategories, { name: '' }])
  }

  const handleSubCategoryChange = (index: number, value: string) => {
    const updated = [...subCategories]
    updated[index].name = value
    setSubCategories(updated)
  }

  const handleDeleteSubCategory = (index: number) => {
    setSubCategories(subCategories.filter((_, i) => i !== index))
  }

  const handleSaveCategory = async () => {
    if (!categoryName || !categoryType) {
      alert('Please fill all required fields')
      return
    }

    try {
      const url = editingId ? `/api/categories?id=${editingId}` : '/api/categories'
      const method = editingId ? 'PUT' : 'POST'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: categoryName,
          type: categoryType,
          subCategories: subCategories.filter(sc => sc.name.trim() !== '')
        })
      })

      if (res.ok) {
        fetchCategories()
        setShowModal(false)
        setCategoryName('')
        setCategoryType('')
        setSubCategories([])
        setEditingId(null)
      }
    } catch (error) {
      console.error('Failed to save category')
    }
  }

  const handleEditCategory = (category: Category) => {
    setEditingId(category._id!)
    setCategoryName(category.name)
    setCategoryType(category.type)
    setSubCategories(category.subCategories || [])
    setShowModal(true)
  }

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return

    try {
      await fetch(`/api/categories?id=${id}`, { method: 'DELETE' })
      fetchCategories()
    } catch (error) {
      console.error('Failed to delete category')
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">Category Manager</h1>
              <p className="text-slate-gray text-sm">Manage event categories and genres</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search categories..."
                  className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none transition-all"
                />
              </div>
              
              <button className="relative p-2 text-slate-gray hover:text-deep-blue hover:bg-teal/10 rounded-lg transition-all">
                <Bell size={20} />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                  3
                </span>
              </button>
              
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center space-x-3 bg-gray-50 rounded-lg px-3 py-2 hover:bg-teal/10 transition-all cursor-pointer"
                >
                  <div className="w-10 h-10 bg-gradient-to-r from-emerald to-teal rounded-full flex items-center justify-center shadow-md">
                    <span className="text-white text-sm font-bold">A</span>
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-deep-blue">Admin User</p>
                    <p className="text-xs text-slate-gray">Super Admin</p>
                  </div>
                  <ChevronDown size={16} className={`text-slate-gray transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                    <button className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                      <User size={16} className="mr-3 text-slate-gray" />
                      Profile Settings
                    </button>
                    <button className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                      <SettingsIcon size={16} className="mr-3 text-slate-gray" />
                      Account Settings
                    </button>
                    <hr className="my-2 border-gray-200" />
                    <button 
                      onClick={() => window.location.href = '/login'}
                      className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={16} className="mr-3" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="p-10 mt-24">
          <div className="flex items-center justify-between mb-6">
            <button 
              onClick={() => setShowModal(true)}
              className="bg-gradient-to-r from-emerald to-teal text-white px-6 py-3 rounded-xl flex items-center gap-2 hover:shadow-lg transition-all"
            >
              <Plus size={20} />
              Add Category
            </button>
          </div>

          {showModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b">
                  <h2 className="text-2xl font-bold text-gray-900">{editingId ? 'Edit Category' : 'Add New Category'}</h2>
                  <button onClick={() => { setShowModal(false); setEditingId(null); setCategoryName(''); setCategoryType(''); setSubCategories([]); }} className="text-gray-500 hover:text-gray-700">
                    <X size={24} />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Category Name *</label>
                    <input
                      type="text"
                      value={categoryName}
                      onChange={(e) => setCategoryName(e.target.value)}
                      placeholder="Enter category name"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Type *</label>
                    <input
                      type="text"
                      value={categoryType}
                      onChange={(e) => setCategoryType(e.target.value)}
                      placeholder="e.g., Event, Genre, etc."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">Sub Categories</label>
                      <button
                        onClick={handleAddSubCategory}
                        className="flex items-center gap-1 text-sm text-teal hover:text-teal/80"
                      >
                        <Plus size={16} />
                        Add Sub Category
                      </button>
                    </div>

                    <div className="space-y-2">
                      {subCategories.map((sub, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={sub.name}
                            onChange={(e) => handleSubCategoryChange(index, e.target.value)}
                            placeholder="Sub category name"
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none"
                          />
                          <button
                            onClick={() => handleDeleteSubCategory(index)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 p-6 border-t">
                  <button
                    onClick={() => { setShowModal(false); setEditingId(null); setCategoryName(''); setCategoryType(''); setSubCategories([]); }}
                    className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCategory}
                    className="px-6 py-2 bg-gradient-to-r from-emerald to-teal text-white rounded-lg hover:shadow-lg"
                  >
                    {editingId ? 'Update Category' : 'Save Category'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories && categories.length > 0 ? categories.map((category) => (
              <div key={category._id} className="bg-white rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-all">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-r from-emerald to-teal rounded-lg flex items-center justify-center">
                        <Tag size={24} className="text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{category.name}</h3>
                        <p className="text-sm text-gray-500">{category.type}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Sub Categories</span>
                      <span className="text-sm font-bold text-teal">{category.subCategories?.length || 0}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                    <button 
                      onClick={() => handleEditCategory(category)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all"
                    >
                      <Edit2 size={16} />
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDeleteCategory(category._id!)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-all"
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )) : (
              <div className="col-span-full bg-white rounded-xl shadow-lg border border-gray-100 p-12 text-center">
                <Tag size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg">No categories found. Click "Add Category" to create one.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
