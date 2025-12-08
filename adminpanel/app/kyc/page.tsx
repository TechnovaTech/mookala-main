'use client'
import { useState, useEffect } from 'react'
import Sidebar from '../../components/Sidebar'
import { Bell, Search, Filter, ChevronDown, LogOut, User, Settings as SettingsIcon, UserCheck, RefreshCw, Eye, Check, X } from 'lucide-react'

interface KYCRecord {
  _id: string;
  phone: string;
  name?: string;
  email?: string;
  city?: string;
  aadharId?: string;
  panId?: string;
  aadharImage?: string;
  panImage?: string;
  kycStatus: string;
  createdAt: string;
  updatedAt: string;
  role: 'artist' | 'organizer';
  bio?: string;
  genre?: string;
  pricing?: string;
}

export default function KYCPage() {
  const [kycRecords, setKycRecords] = useState<KYCRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<KYCRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [selectedKYC, setSelectedKYC] = useState<KYCRecord | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'all' | 'artist' | 'organizer'>('all');

  useEffect(() => {
    fetchKYCRecords();
  }, []);

  const fetchKYCRecords = async () => {
    setLoading(true);
    try {
      const [organizerResponse, artistResponse] = await Promise.all([
        fetch('/api/kyc'),
        fetch('/api/kyc?role=artist')
      ]);
      
      const organizerData = await organizerResponse.json();
      const artistData = await artistResponse.json();
      
      console.log('Organizer data:', organizerData);
      console.log('Artist data:', artistData);
      
      const allRecords = [
        ...(organizerData.success ? organizerData.kycRecords.map((record: any) => ({ ...record, role: 'organizer' as const })) : []),
        ...(artistData.success ? artistData.kycRecords.map((record: any) => ({ ...record, role: 'artist' as const })) : [])
      ];
      
      console.log('All records:', allRecords);
      
      setKycRecords(allRecords);
      setFilteredRecords(allRecords);
    } catch (error) {
      console.error('Error fetching KYC records:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateKYCStatus = async (phone: string, status: string, role: string) => {
    try {
      const response = await fetch('/api/kyc/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, status, role })
      });
      
      if (response.ok) {
        fetchKYCRecords();
        setShowModal(false);
      }
    } catch (error) {
      console.error('Error updating KYC status:', error);
    }
  };

  const filterRecords = (role: 'all' | 'artist' | 'organizer') => {
    setSelectedRole(role);
    if (role === 'all') {
      setFilteredRecords(kycRecords);
    } else {
      setFilteredRecords(kycRecords.filter(record => record.role === role));
    }
  };

  const viewKYC = (kyc: KYCRecord) => {
    setSelectedKYC(kyc);
    setShowModal(true);
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64 transition-all duration-300 min-h-screen">
        <header className="bg-white shadow-lg border-b border-gray-200 px-6 py-4 fixed top-0 right-0 left-64 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-deep-blue">KYC Management</h1>
              <p className="text-slate-gray text-sm">Review and manage organizer KYC submissions.</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search KYC records..."
                  className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal outline-none transition-all"
                />
              </div>
              
              <button 
                onClick={fetchKYCRecords}
                disabled={loading}
                className="flex items-center px-4 py-2 bg-emerald text-white rounded-lg hover:bg-emerald/90 transition-all disabled:opacity-50"
              >
                <RefreshCw size={16} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              
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
          <div className="bg-white rounded-xl shadow-lg border border-gray-100">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center">
                <UserCheck className="text-emerald mr-3" size={24} />
                <h2 className="text-xl font-bold text-gray-900">KYC Submissions ({filteredRecords.length})</h2>
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => filterRecords('all')}
                    className={`px-3 py-1 text-sm rounded-md transition-all ${
                      selectedRole === 'all' 
                        ? 'bg-white text-emerald shadow-sm font-medium' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    All ({kycRecords.length})
                  </button>
                  <button
                    onClick={() => filterRecords('organizer')}
                    className={`px-3 py-1 text-sm rounded-md transition-all ${
                      selectedRole === 'organizer' 
                        ? 'bg-white text-emerald shadow-sm font-medium' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Organizers ({kycRecords.filter(r => r.role === 'organizer').length})
                  </button>
                  <button
                    onClick={() => filterRecords('artist')}
                    className={`px-3 py-1 text-sm rounded-md transition-all ${
                      selectedRole === 'artist' 
                        ? 'bg-white text-emerald shadow-sm font-medium' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Artists ({kycRecords.filter(r => r.role === 'artist').length})
                  </button>
                </div>
              </div>
            </div>
            
            {loading ? (
              <div className="flex justify-center items-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documents</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredRecords.map((kyc) => (
                      <tr key={kyc._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-10 h-10 bg-gradient-to-r from-emerald to-teal rounded-full flex items-center justify-center shadow-md">
                              <span className="text-white font-semibold text-sm">
                                {kyc.name ? kyc.name.charAt(0).toUpperCase() : 'O'}
                              </span>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{kyc.name || 'Unnamed'}</div>
                              <div className="text-sm text-gray-500">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  kyc.role === 'artist' 
                                    ? 'bg-purple-100 text-purple-800' 
                                    : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {kyc.role}
                                </span>
                                <span className="ml-2">{kyc.city || 'No city'}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{kyc.phone}</div>
                          <div className="text-sm text-gray-500">{kyc.email || 'No email'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">Aadhar: {kyc.aadharId || 'N/A'}</div>
                          <div className="text-sm text-gray-500">PAN: {kyc.panId || 'N/A'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            kyc.kycStatus === 'approved' 
                              ? 'bg-emerald/10 text-emerald border border-emerald/20' 
                              : kyc.kycStatus === 'pending'
                              ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                              : 'bg-red-100 text-red-800 border border-red-200'
                          }`}>
                            {kyc.kycStatus}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(kyc.updatedAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => viewKYC(kyc)}
                              className="text-emerald hover:text-emerald/80 flex items-center"
                            >
                              <Eye size={16} className="mr-1" />
                              View
                            </button>
                            {kyc.kycStatus === 'pending' && (
                              <>
                                <button
                                  onClick={() => updateKYCStatus(kyc.phone, 'approved', kyc.role)}
                                  className="text-green-600 hover:text-green-800 flex items-center"
                                >
                                  <Check size={16} className="mr-1" />
                                  Accept
                                </button>
                                <button
                                  onClick={() => updateKYCStatus(kyc.phone, 'rejected', kyc.role)}
                                  className="text-red-600 hover:text-red-800 flex items-center"
                                >
                                  <X size={16} className="mr-1" />
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && filteredRecords.length === 0 && (
              <div className="text-center py-20">
                <UserCheck className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-500 text-lg font-medium">No KYC submissions found</p>
                <p className="text-gray-400 text-sm">KYC submissions will appear here for review</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* KYC Detail Modal */}
      {showModal && selectedKYC && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">KYC Details - {selectedKYC.name}</h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h4>
                  <div className="space-y-3">
                    <div><span className="font-medium">Name:</span> {selectedKYC.name || 'N/A'}</div>
                    <div><span className="font-medium">Phone:</span> {selectedKYC.phone}</div>
                    <div><span className="font-medium">Email:</span> {selectedKYC.email || 'N/A'}</div>
                    <div><span className="font-medium">City:</span> {selectedKYC.city || 'N/A'}</div>
                    <div><span className="font-medium">Role:</span> 
                      <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                        selectedKYC.role === 'artist' 
                          ? 'bg-purple-100 text-purple-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {selectedKYC.role}
                      </span>
                    </div>
                    {selectedKYC.role === 'artist' && (
                      <>
                        {selectedKYC.bio && <div><span className="font-medium">Bio:</span> {selectedKYC.bio}</div>}
                        {selectedKYC.genre && <div><span className="font-medium">Genre:</span> {selectedKYC.genre}</div>}
                        {selectedKYC.pricing && <div><span className="font-medium">Pricing:</span> ₹{selectedKYC.pricing}</div>}
                      </>
                    )}
                    <div><span className="font-medium">Status:</span> 
                      <span className={`ml-2 px-2 py-1 rounded text-xs ${
                        selectedKYC.kycStatus === 'approved' ? 'bg-green-100 text-green-800' :
                        selectedKYC.kycStatus === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {selectedKYC.kycStatus}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Document Information</h4>
                  <div className="space-y-3">
                    <div><span className="font-medium">Aadhar ID:</span> {selectedKYC.aadharId || 'N/A'}</div>
                    <div><span className="font-medium">PAN ID:</span> {selectedKYC.panId || 'N/A'}</div>
                    <div><span className="font-medium">Submitted:</span> {new Date(selectedKYC.updatedAt).toLocaleString()}</div>
                  </div>
                </div>
              </div>
              
              <div className="mt-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Document Images</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {selectedKYC.aadharImage && (
                    <div>
                      <h5 className="font-medium mb-2">Aadhar Card</h5>
                      <img 
                        src={`data:image/jpeg;base64,${selectedKYC.aadharImage}`}
                        alt="Aadhar Card"
                        className="w-full h-48 object-cover rounded-lg border"
                      />
                    </div>
                  )}
                  {selectedKYC.panImage && (
                    <div>
                      <h5 className="font-medium mb-2">PAN Card</h5>
                      <img 
                        src={`data:image/jpeg;base64,${selectedKYC.panImage}`}
                        alt="PAN Card"
                        className="w-full h-48 object-cover rounded-lg border"
                      />
                    </div>
                  )}
                </div>
              </div>
              
              {selectedKYC.kycStatus === 'pending' && (
                <div className="mt-6 flex space-x-4">
                  <button
                    onClick={() => updateKYCStatus(selectedKYC.phone, 'approved', selectedKYC.role)}
                    className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Check size={16} className="mr-2" />
                    Approve KYC
                  </button>
                  <button
                    onClick={() => updateKYCStatus(selectedKYC.phone, 'rejected', selectedKYC.role)}
                    className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    <X size={16} className="mr-2" />
                    Reject KYC
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}