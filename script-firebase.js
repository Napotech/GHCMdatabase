// ========================================
// FIREBASE CONFIGURATION
// ========================================
// Replace these with your Firebase project credentials
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Collection name
const MEMBERS_COLLECTION = 'members';

// ========================================
// TAB NAVIGATION
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tab navigation
    const tabButtons = document.querySelectorAll('.tab-btn');
    const contentSections = document.querySelectorAll('.content-section');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            
            // Remove active class from all tabs and sections
            tabButtons.forEach(btn => btn.classList.remove('active'));
            contentSections.forEach(section => section.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding section
            this.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
            
            // Load database when database tab is clicked
            if (targetTab === 'database') {
                loadDatabase();
            }
        });
    });
    
    // Initialize all event listeners
    initializeEventListeners();
    
    // Load database on page load
    loadDatabase();
    
    // Set up real-time listener for automatic updates
    setupRealtimeListener();
});

// ========================================
// EVENT LISTENERS INITIALIZATION
// ========================================
function initializeEventListeners() {
    // Add Member Form
    document.getElementById('addMemberForm').addEventListener('submit', handleAddMember);
    
    // Search Member
    document.getElementById('searchMemberBtn').addEventListener('click', handleSearchMember);
    
    // Edit Member Form
    document.getElementById('editMemberForm').addEventListener('submit', handleUpdateMember);
    
    // Delete Member
    document.getElementById('deleteMemberBtn').addEventListener('click', handleDeleteMember);
    
    // Cancel Edit
    document.getElementById('cancelEditBtn').addEventListener('click', function() {
        document.getElementById('editFormContainer').style.display = 'none';
        document.getElementById('searchResults').innerHTML = '';
    });
    
    // Database Actions
    document.getElementById('refreshDatabaseBtn').addEventListener('click', loadDatabase);
    document.getElementById('downloadDatabaseBtn').addEventListener('click', downloadDatabase);
}

// ========================================
// MEMBER ID GENERATION
// ========================================
async function generateMemberId() {
    try {
        // Get all members to find the highest ID
        const snapshot = await db.collection(MEMBERS_COLLECTION)
            .orderBy('memberId', 'desc')
            .limit(1)
            .get();
        
        let maxNumber = 0;
        
        if (!snapshot.empty) {
            const lastMember = snapshot.docs[0].data();
            if (lastMember.memberId && lastMember.memberId.startsWith('GHCM-')) {
                const numberPart = parseInt(lastMember.memberId.split('-')[1]);
                if (numberPart > maxNumber) {
                    maxNumber = numberPart;
                }
            }
        }
        
        // Generate new ID
        const newNumber = maxNumber + 1;
        const paddedNumber = String(newNumber).padStart(3, '0');
        return `GHCM-${paddedNumber}`;
        
    } catch (error) {
        console.error('Error generating Member ID:', error);
        // Fallback: generate random ID
        return `GHCM-${Date.now().toString().slice(-6)}`;
    }
}

// ========================================
// ADD MEMBER
// ========================================
async function handleAddMember(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const messageBox = document.getElementById('addMemberMessage');
    
    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-icon">⏳</span> Registering...';
    
    try {
        // Check if phone number already exists
        const phoneNumber = document.getElementById('phoneNumber').value;
        const phoneCheck = await db.collection(MEMBERS_COLLECTION)
            .where('phoneNumber', '==', phoneNumber)
            .get();
        
        if (!phoneCheck.empty) {
            showMessage(messageBox, 'error', 
                '✗ Error: Phone number already exists in database');
            return;
        }
        
        // Generate Member ID
        const memberId = await generateMemberId();
        
        // Prepare member data
        const memberData = {
            memberId: memberId,
            fullName: document.getElementById('fullName').value,
            gender: document.getElementById('gender').value,
            dateOfBirth: document.getElementById('dateOfBirth').value,
            phoneNumber: phoneNumber,
            residence: document.getElementById('residence').value,
            department: document.getElementById('department').value || '',
            dateJoined: document.getElementById('dateJoined').value,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: new Date().toISOString()
        };
        
        // Add to Firestore
        await db.collection(MEMBERS_COLLECTION).add(memberData);
        
        showMessage(messageBox, 'success', 
            `✓ Member registered successfully! Member ID: ${memberId}`);
        form.reset();
        
        // Refresh database if on database tab
        if (document.getElementById('database').classList.contains('active')) {
            loadDatabase();
        }
        
    } catch (error) {
        console.error('Error adding member:', error);
        showMessage(messageBox, 'error', 
            '✗ Error: Failed to register member. ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="btn-icon">✓</span> Register Member';
    }
}

// ========================================
// SEARCH MEMBER
// ========================================
async function handleSearchMember() {
    const searchName = document.getElementById('searchName').value.trim();
    const searchPhone = document.getElementById('searchPhone').value.trim();
    const searchMemberId = document.getElementById('searchMemberId').value.trim();
    const resultsDiv = document.getElementById('searchResults');
    const messageBox = document.getElementById('editMemberMessage');
    
    // Clear previous results
    resultsDiv.innerHTML = '';
    document.getElementById('editFormContainer').style.display = 'none';
    hideMessage(messageBox);
    
    if (!searchName && !searchPhone && !searchMemberId) {
        showMessage(messageBox, 'error', 'Please enter at least one search criteria');
        return;
    }
    
    resultsDiv.innerHTML = '<div class="loader"></div><p>Searching...</p>';
    resultsDiv.classList.add('show');
    
    try {
        let query = db.collection(MEMBERS_COLLECTION);
        
        // Build query based on search criteria
        if (searchMemberId) {
            query = query.where('memberId', '==', searchMemberId.toUpperCase());
        } else if (searchPhone) {
            query = query.where('phoneNumber', '==', searchPhone);
        }
        
        const snapshot = await query.get();
        let members = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Additional filtering for name search (Firestore doesn't support partial string search well)
        if (searchName && !searchMemberId && !searchPhone) {
            const allMembers = await db.collection(MEMBERS_COLLECTION).get();
            members = allMembers.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(member => 
                    member.fullName.toLowerCase().includes(searchName.toLowerCase())
                );
        } else if (searchName) {
            members = members.filter(member => 
                member.fullName.toLowerCase().includes(searchName.toLowerCase())
            );
        }
        
        if (members.length === 0) {
            resultsDiv.innerHTML = '<p>No members found matching your search criteria.</p>';
        } else {
            let resultsHTML = `<h4>Found ${members.length} member(s):</h4>`;
            
            members.forEach((member, index) => {
                resultsHTML += `
                    <div class="search-result-item" onclick='selectMemberForEdit(${JSON.stringify(member).replace(/'/g, "&#39;")})'>
                        <strong>${member.fullName}</strong> (${member.memberId})<br>
                        Phone: ${member.phoneNumber} | Department: ${member.department || 'N/A'}
                    </div>
                `;
            });
            
            resultsDiv.innerHTML = resultsHTML;
        }
    } catch (error) {
        console.error('Error searching members:', error);
        resultsDiv.innerHTML = '<p class="error">Error searching members. Please try again.</p>';
    }
}

// ========================================
// SELECT MEMBER FOR EDITING
// ========================================
function selectMemberForEdit(member) {
    const editFormContainer = document.getElementById('editFormContainer');
    
    // Populate edit form
    document.getElementById('editMemberId').value = member.memberId;
    document.getElementById('editRowIndex').value = member.id; // Firestore document ID
    document.getElementById('editFullName').value = member.fullName;
    document.getElementById('editGender').value = member.gender;
    document.getElementById('editDateOfBirth').value = member.dateOfBirth;
    document.getElementById('editPhoneNumber').value = member.phoneNumber;
    document.getElementById('editResidence').value = member.residence;
    document.getElementById('editDepartment').value = member.department || '';
    document.getElementById('editDateJoined').value = member.dateJoined;
    
    // Show edit form
    editFormContainer.style.display = 'block';
    editFormContainer.scrollIntoView({ behavior: 'smooth' });
}

// ========================================
// UPDATE MEMBER
// ========================================
async function handleUpdateMember(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const messageBox = document.getElementById('editMemberMessage');
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-icon">⏳</span> Updating...';
    
    try {
        const docId = document.getElementById('editRowIndex').value;
        const phoneNumber = document.getElementById('editPhoneNumber').value;
        
        // Check if phone number exists for another member
        const phoneCheck = await db.collection(MEMBERS_COLLECTION)
            .where('phoneNumber', '==', phoneNumber)
            .get();
        
        if (!phoneCheck.empty && phoneCheck.docs[0].id !== docId) {
            showMessage(messageBox, 'error', 
                '✗ Error: Phone number already exists for another member');
            return;
        }
        
        const updatedData = {
            fullName: document.getElementById('editFullName').value,
            gender: document.getElementById('editGender').value,
            dateOfBirth: document.getElementById('editDateOfBirth').value,
            phoneNumber: phoneNumber,
            residence: document.getElementById('editResidence').value,
            department: document.getElementById('editDepartment').value || '',
            dateJoined: document.getElementById('editDateJoined').value,
            updatedAt: new Date().toISOString()
        };
        
        await db.collection(MEMBERS_COLLECTION).doc(docId).update(updatedData);
        
        showMessage(messageBox, 'success', '✓ Member updated successfully!');
        document.getElementById('editFormContainer').style.display = 'none';
        document.getElementById('searchResults').innerHTML = '';
        
        // Clear search fields
        document.getElementById('searchName').value = '';
        document.getElementById('searchPhone').value = '';
        document.getElementById('searchMemberId').value = '';
        
        // Refresh database if on database tab
        if (document.getElementById('database').classList.contains('active')) {
            loadDatabase();
        }
        
    } catch (error) {
        console.error('Error updating member:', error);
        showMessage(messageBox, 'error', '✗ Error: Failed to update member. ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="btn-icon">💾</span> Update Member';
    }
}

// ========================================
// DELETE MEMBER
// ========================================
async function handleDeleteMember() {
    const memberId = document.getElementById('editMemberId').value;
    const memberName = document.getElementById('editFullName').value;
    const docId = document.getElementById('editRowIndex').value;
    const messageBox = document.getElementById('editMemberMessage');
    
    if (!confirm(`Are you sure you want to delete ${memberName} (${memberId})?\n\nThis action cannot be undone.`)) {
        return;
    }
    
    const deleteBtn = document.getElementById('deleteMemberBtn');
    deleteBtn.disabled = true;
    deleteBtn.innerHTML = '<span class="btn-icon">⏳</span> Deleting...';
    
    try {
        await db.collection(MEMBERS_COLLECTION).doc(docId).delete();
        
        showMessage(messageBox, 'success', '✓ Member deleted successfully!');
        document.getElementById('editFormContainer').style.display = 'none';
        document.getElementById('searchResults').innerHTML = '';
        
        // Clear search fields
        document.getElementById('searchName').value = '';
        document.getElementById('searchPhone').value = '';
        document.getElementById('searchMemberId').value = '';
        
        // Refresh database if on database tab
        if (document.getElementById('database').classList.contains('active')) {
            loadDatabase();
        }
        
    } catch (error) {
        console.error('Error deleting member:', error);
        showMessage(messageBox, 'error', '✗ Error: Failed to delete member. ' + error.message);
    } finally {
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = '<span class="btn-icon">🗑️</span> Delete Member';
    }
}

// ========================================
// LOAD DATABASE
// ========================================
async function loadDatabase() {
    const tableBody = document.getElementById('membersTableBody');
    const memberCount = document.getElementById('memberCount');
    const messageBox = document.getElementById('databaseMessage');
    
    tableBody.innerHTML = `
        <tr>
            <td colspan="9" class="loading-message">
                <div class="loader"></div>
                Loading members...
            </td>
        </tr>
    `;
    
    try {
        const snapshot = await db.collection(MEMBERS_COLLECTION)
            .orderBy('memberId', 'asc')
            .get();
        
        if (snapshot.empty) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="loading-message">
                        No members registered yet. Add your first member!
                    </td>
                </tr>
            `;
            memberCount.textContent = '0';
        } else {
            let tableHTML = '';
            
            snapshot.forEach(doc => {
                const member = { id: doc.id, ...doc.data() };
                tableHTML += `
                    <tr>
                        <td>${member.memberId}</td>
                        <td>${member.fullName}</td>
                        <td>${member.gender}</td>
                        <td>${member.dateOfBirth}</td>
                        <td>${member.phoneNumber}</td>
                        <td>${member.residence}</td>
                        <td>${member.department || 'N/A'}</td>
                        <td>${member.dateJoined}</td>
                        <td class="action-buttons">
                            <button class="btn btn-primary btn-small" onclick='copyMemberInfo(${JSON.stringify(member).replace(/'/g, "&#39;")})'
                                    title="Copy member information">
                                📋 Copy
                            </button>
                            <button class="btn btn-secondary btn-small" onclick='editMemberFromTable(${JSON.stringify(member).replace(/'/g, "&#39;")})'
                                    title="Edit member">
                                ✏️ Edit
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            tableBody.innerHTML = tableHTML;
            memberCount.textContent = snapshot.size;
        }
    } catch (error) {
        console.error('Error loading members:', error);
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="loading-message">
                    Error loading members: ${error.message}
                </td>
            </tr>
        `;
        showMessage(messageBox, 'error', '✗ Error: Failed to load database');
    }
}

// ========================================
// REAL-TIME UPDATES
// ========================================
function setupRealtimeListener() {
    // Listen for real-time changes to the members collection
    db.collection(MEMBERS_COLLECTION).onSnapshot((snapshot) => {
        // Only auto-refresh if we're on the database tab
        if (document.getElementById('database').classList.contains('active')) {
            console.log('Database updated in real-time');
            loadDatabase();
        }
    }, (error) => {
        console.error('Error in real-time listener:', error);
    });
}

// ========================================
// COPY MEMBER INFO
// ========================================
function copyMemberInfo(member) {
    const memberText = `
GLORIOUS HEIGHT CHARISMATIC MINISTRY
MEMBER INFORMATION

Member ID: ${member.memberId}
Full Name: ${member.fullName}
Gender: ${member.gender}
Date of Birth: ${member.dateOfBirth}
Phone Number: ${member.phoneNumber}
Residence: ${member.residence}
Department: ${member.department || 'N/A'}
Date Joined Church: ${member.dateJoined}
Registered: ${member.createdAt || 'N/A'}
    `.trim();
    
    navigator.clipboard.writeText(memberText).then(() => {
        alert('Member information copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    });
}

// ========================================
// EDIT MEMBER FROM TABLE
// ========================================
function editMemberFromTable(member) {
    // Switch to edit tab
    document.querySelector('[data-tab="edit-member"]').click();
    
    // Populate search field with member ID
    document.getElementById('searchMemberId').value = member.memberId;
    
    // Trigger search
    setTimeout(() => {
        document.getElementById('searchMemberBtn').click();
    }, 300);
}

// ========================================
// DOWNLOAD DATABASE
// ========================================
async function downloadDatabase() {
    const messageBox = document.getElementById('databaseMessage');
    
    try {
        const snapshot = await db.collection(MEMBERS_COLLECTION)
            .orderBy('memberId', 'asc')
            .get();
        
        if (snapshot.empty) {
            showMessage(messageBox, 'error', 'No members to download');
            return;
        }
        
        let textContent = `
═══════════════════════════════════════════════════════════════
         GLORIOUS HEIGHT CHARISMATIC MINISTRY
              MEMBER DATABASE EXPORT
═══════════════════════════════════════════════════════════════

Export Date: ${new Date().toLocaleString()}
Total Members: ${snapshot.size}

═══════════════════════════════════════════════════════════════

`;
        
        let index = 1;
        snapshot.forEach(doc => {
            const member = doc.data();
            textContent += `
MEMBER ${index}
───────────────────────────────────────────────────────────────
Member ID:         ${member.memberId}
Full Name:         ${member.fullName}
Gender:            ${member.gender}
Date of Birth:     ${member.dateOfBirth}
Phone Number:      ${member.phoneNumber}
Residence:         ${member.residence}
Department:        ${member.department || 'N/A'}
Date Joined:       ${member.dateJoined}
Registration Date: ${member.createdAt || 'N/A'}
═══════════════════════════════════════════════════════════════

`;
            index++;
        });
        
        textContent += `
End of Report
Generated by: Glorious Height Charismatic Ministry Database System
Powered by Firebase
`;
        
        // Create and download file
        const blob = new Blob([textContent], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GHCM_Member_Database_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showMessage(messageBox, 'success', '✓ Database downloaded successfully!');
    } catch (error) {
        console.error('Error downloading database:', error);
        showMessage(messageBox, 'error', '✗ Error: Failed to download database');
    }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================
function showMessage(element, type, message) {
    element.className = `message-box show ${type}`;
    element.textContent = message;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        hideMessage(element);
    }, 5000);
}

function hideMessage(element) {
    element.className = 'message-box';
    element.textContent = '';
}

// ========================================
// ERROR HANDLING
// ========================================
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
});
