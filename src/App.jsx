import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute'
import RoleRoute from './components/ProtectedRoute/RoleRoute'
import AdminLayout from './components/Layout/AdminLayout'
import TeacherLayout from './components/Layout/TeacherLayout'
import RoleHome from './components/RoleHome/RoleHome'

import Login from './auth/Login/Login'

// ---- Admin pages (/admin/*) ----
import AdminDashboard from './pages/admin/Dashboard/Dashboard'
import AdminTeachers from './pages/admin/Teachers/Teachers'
import AdminStudents from './pages/admin/Students/Students'
import AdminStudentProfile from './pages/admin/StudentProfile/StudentProfile'
import AdminClasses from './pages/admin/Classes/Classes'
import AdminSubjects from './pages/admin/Subjects/Subjects'
import AdminTimetable from './pages/admin/Timetable/Timetable'
import AdminExams from './pages/admin/Exams/Exams'
import AdminAnnouncements from './pages/admin/Announcements/Announcements'
import AdminAttendance from './pages/admin/Attendance/Attendance'
import AdminStudyMaterials from './pages/admin/StudyMaterials/StudyMaterials'
import AdminTeacherAssignments from './pages/admin/TeacherAssignments/TeacherAssignments'
import AdminSubstitutes from './pages/admin/Substitutes/Substitutes'

// ---- Teacher pages (/teacher/*) ----
import TeacherDashboard from './pages/teacher/Dashboard/Dashboard'
import TeacherAttendance from './pages/teacher/Attendance/Attendance'
import TeacherTimetable from './pages/teacher/Timetable/Timetable'
import TeacherExams from './pages/teacher/Exams/Exams'
import TeacherAnnouncements from './pages/teacher/Announcements/Announcements'
import TeacherStudents from './pages/teacher/Students/Students'
import TeacherProfile from './pages/teacher/Profile/Profile'
import TeacherStudyMaterials from './pages/teacher/StudyMaterials/StudyMaterials'

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* ============================ ADMIN ============================ */}
      <Route
        path="/admin"
        element={
          <RoleRoute role="admin">
            <AdminLayout />
          </RoleRoute>
        }
      >
        {/* <Route index element={<AdminDashboard />} /> */}
        <Route index element={<Navigate to="announcements" replace />} />
        <Route path="teachers" element={<AdminTeachers />} />
        <Route path="students" element={<AdminStudents />} />
        <Route path="students/:studentId" element={<AdminStudentProfile />} />
        <Route path="classes" element={<AdminClasses />} />
        <Route path="subjects" element={<AdminSubjects />} />
        <Route path="timetable" element={<AdminTimetable />} />
        <Route path="exams" element={<AdminExams />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="attendance" element={<AdminAttendance />} />
        <Route path="study-materials" element={<AdminStudyMaterials />} />
        <Route path="teacher-assignments" element={<AdminTeacherAssignments />} />
        <Route path="substitutes" element={<AdminSubstitutes />} />
      </Route>

      {/* =========================== TEACHER =========================== */}
      <Route
        path="/teacher"
        element={
          <RoleRoute role="teacher">
            <TeacherLayout />
          </RoleRoute>
        }
      >
        <Route index element={<TeacherDashboard />} />
        <Route path="attendance" element={<TeacherAttendance />} />
        <Route path="timetable" element={<TeacherTimetable />} />
        <Route path="exams" element={<TeacherExams />} />
        <Route path="announcements" element={<TeacherAnnouncements />} />
        <Route path="students" element={<TeacherStudents />} />
        <Route path="profile" element={<TeacherProfile />} />
        <Route path="study-materials" element={<TeacherStudyMaterials />} />
      </Route>

      {/* Root: send a logged-in user to their role's home, else to login. */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RoleHome />
          </ProtectedRoute>
        }
      />

      {/* Anything unknown -> root (which then routes by role) */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App