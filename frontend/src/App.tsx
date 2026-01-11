import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { PartnerAuthProvider, usePartnerAuth } from './contexts/PartnerAuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { KPIProvider } from './contexts/KPIContext'
import { Sidebar } from './components/Sidebar'
import { PartnerSidebar } from './components/PartnerSidebar'
import { Header } from './components/Header'
import { PartnerHeader } from './components/PartnerHeader'
import { ChatBot } from './components/ChatBot'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { PartnerLogin } from './pages/Partner/PartnerLogin'
import { PartnerDashboard } from './pages/Partner/PartnerDashboard'
import { PartnerReferralLink } from './pages/Partner/PartnerReferralLink'
import { PartnerCustomers } from './pages/Partner/PartnerCustomers'
import { PartnerCustomerDetails } from './pages/Partner/PartnerCustomerDetails'
import { PartnerFinancialStatement } from './pages/Partner/PartnerFinancialStatement'
import { PartnerSupport } from './pages/Partner/PartnerSupport'
import { Dashboard } from './pages/Dashboard'
import { Playbooks } from './pages/Playbooks'
import { Leads } from './pages/Leads'
import { Sequences } from './pages/Sequences'
import { Tasks } from './pages/Tasks'
import { Appointments } from './pages/Appointments'
import { Prospecting } from './pages/Prospecting'
import { SettingsHub } from './pages/Settings/SettingsHub'
import { OnboardingWizard } from './pages/OnboardingWizard'
import { Accounts } from './pages/Accounts'
import { Contacts } from './pages/Contacts'
import { Opportunities } from './pages/Opportunities'
import { Proposals } from './pages/Proposals'
import { SalesFunnels } from './pages/SalesFunnels'
import { AuditLog } from './pages/AuditLog'
import { KPIOverview } from './pages/KPI/KPIOverview'
import { LivePulseDashboard } from './pages/LivePulse/LivePulseDashboard'
import { VisitReports } from './pages/VisitReports'
import { CatalogManager } from './pages/CatalogManager'
import { Orders } from './pages/Orders'
import { Finance } from './pages/Finance'
import { CustomModulePage } from './pages/CustomModulePage'
import { BackofficeDashboard } from './pages/Backoffice/BackofficeDashboard'
import { BackofficePartners } from './pages/Backoffice/BackofficePartners'
import { BackofficeSalesReport } from './pages/Backoffice/BackofficeSalesReport'
import { Toaster } from './components/ui/toaster'
import { BackofficeTenants } from './pages/Backoffice/BackofficeTenants'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  
  // Aguardar até que a autenticação seja verificada
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4">Carregando...</div>
        </div>
      </div>
    )
  }
  
  // Só redirecionar se realmente não estiver autenticado
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}


function ProtectedPartnerRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = usePartnerAuth()
  
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4">Carregando...</div>
        </div>
      </div>
    )
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/partner/login" replace />
  }
  
  return <>{children}</>
}

function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden w-full md:w-auto">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}

function PartnerLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen">
      <PartnerSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden w-full md:w-auto">
        <PartnerHeader onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingWizard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/playbooks"
        element={
          <ProtectedRoute>
            <Layout>
              <Playbooks />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads"
        element={
          <ProtectedRoute>
            <Layout>
              <Leads />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sequences"
        element={
          <ProtectedRoute>
            <Layout>
              <Sequences />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <Layout>
              <Tasks />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/appointments"
        element={
          <ProtectedRoute>
            <Layout>
              <Appointments />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/prospecting"
        element={
          <ProtectedRoute>
            <Layout>
              <Prospecting />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/accounts"
        element={
          <ProtectedRoute>
            <Layout>
              <Accounts />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          <ProtectedRoute>
            <Layout>
              <Contacts />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/opportunities"
        element={
          <ProtectedRoute>
            <Layout>
              <Opportunities />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/proposals"
        element={
          <ProtectedRoute>
            <Layout>
              <Proposals />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/catalog"
        element={
          <ProtectedRoute>
            <Layout>
              <CatalogManager />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <Layout>
              <Orders />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/finance"
        element={
          <ProtectedRoute>
            <Layout>
              <Finance />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales-funnels"
        element={
          <ProtectedRoute>
            <Layout>
              <SalesFunnels />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit-log"
        element={
          <ProtectedRoute>
            <Layout>
              <AuditLog />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Layout>
              <SettingsHub />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/kpi"
        element={
          <ProtectedRoute>
            <Layout>
              <KPIOverview />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/live-pulse"
        element={
          <ProtectedRoute>
            <Layout>
              <LivePulseDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/visit-reports"
        element={
          <ProtectedRoute>
            <Layout>
              <VisitReports />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/custom-module/:moduleId"
        element={
          <ProtectedRoute>
            <Layout>
              <CustomModulePage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/backoffice"
        element={
          <ProtectedRoute>
            <Layout>
              <BackofficeDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/backoffice/partners"
        element={
          <ProtectedRoute>
            <Layout>
              <BackofficePartners />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/backoffice/sales-report"
        element={
          <ProtectedRoute>
            <Layout>
              <BackofficeSalesReport />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/backoffice/tenants"
        element={
          <ProtectedRoute>
            <Layout>
              <BackofficeTenants />
            </Layout>
          </ProtectedRoute>
        }
      />
      {/* Partner Portal Routes */}
      <Route path="/partner/login" element={<PartnerLogin />} />
      <Route
        path="/partner/dashboard"
        element={
          <ProtectedPartnerRoute>
            <PartnerLayout>
              <PartnerDashboard />
            </PartnerLayout>
          </ProtectedPartnerRoute>
        }
      />
      <Route
        path="/partner/referral-link"
        element={
          <ProtectedPartnerRoute>
            <PartnerLayout>
              <PartnerReferralLink />
            </PartnerLayout>
          </ProtectedPartnerRoute>
        }
      />
      <Route
        path="/partner/customers"
        element={
          <ProtectedPartnerRoute>
            <PartnerLayout>
              <PartnerCustomers />
            </PartnerLayout>
          </ProtectedPartnerRoute>
        }
      />
      <Route
        path="/partner/customers/:customerId"
        element={
          <ProtectedPartnerRoute>
            <PartnerLayout>
              <PartnerCustomerDetails />
            </PartnerLayout>
          </ProtectedPartnerRoute>
        }
      />
      <Route
        path="/partner/financial-statement"
        element={
          <ProtectedPartnerRoute>
            <PartnerLayout>
              <PartnerFinancialStatement />
            </PartnerLayout>
          </ProtectedPartnerRoute>
        }
      />
      <Route
        path="/partner/support"
        element={
          <ProtectedPartnerRoute>
            <PartnerLayout>
              <PartnerSupport />
            </PartnerLayout>
          </ProtectedPartnerRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" />} />
    </Routes>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <PartnerAuthProvider>
        <KPIProvider>
          <BrowserRouter>
            <AppRoutes />
            <Toaster />
            <ChatBot />
          </BrowserRouter>
        </KPIProvider>
      </PartnerAuthProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App

