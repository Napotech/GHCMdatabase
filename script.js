// script.js - Save this as a separate file

// ========================================
// FIREBASE CONFIGURATION
// ========================================
const firebaseConfig = {
    apiKey: "AIzaSyC9Jwt7bJM_Ytf_RrReTuie647H-8CZU1w",
    authDomain: "churchdatabase-ff327.firebaseapp.com",
    projectId: "churchdatabase-ff327",
    storageBucket: "churchdatabase-ff327.firebasestorage.app",
    messagingSenderId: "676974447672",
    appId: "1:676974447672:web:89bfa950bddd297f29eacd",
    measurementId: "G-W6XY7XED36"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

const MEMBERS_COLLECTION = 'members';

// Global variables for photo handling
let currentPhotoFile = null;
let currentEditPhotoFile = null;

// ========================================
// PHOTO PREVIEW HANDLERS
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    // Photo upload handlers
    document.getElementById('memberPhoto').addEventListener('change', function(e) {
        handlePhotoPreview(e.target.files[0], 'photoPreviewImg', 'removePhotoBtn');
        currentPhotoFile = e.target.files[0];
    });

    document.getElementById('editMemberPhoto').addEventListener('change', function(e) {
        handlePhotoPreview(e.target.files[0], 'editPhotoPreviewImg', 'editRemovePhotoBtn');
        currentEditPhotoFile = e.target.files[0];
    });

    document.getElementById('removePhotoBtn').addEventListener('click', function() {
        removePhoto('memberPhoto', 'photoPreviewImg', 'removePhotoBtn');
        currentPhotoFile = null;
    });

    document.getElementById('editRemovePhotoBtn').addEventListener('click', function() {
        removePhoto('editMemberPhoto', 'editPhotoPreviewImg', 'editRemovePhotoBtn');
        currentEditPhotoFile = null;
    });

    // Initialize tab navigation
    const tabButtons = document.querySelectorAll('.tab-btn');
    const contentSections = document.querySelectorAll('.content-section');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            
            tabButtons.forEach(btn => btn.classList.remove('active'));
            contentSections.forEach(section => section.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
            
            if (targetTab === 'database') {
                loadDatabase();
            }
        });
    });
    
    initializeEventListeners();
    loadDatabase();
    setupRealtimeListener();
});

function handlePhotoPreview(file, imgId, btnId) {
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById(imgId);
            const placeholder = img.previousElementSibling;
            img.src = e.target.result;
            img.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
            document.getElementById(btnId).style.display = 'inline-flex';
        };
        reader.readAsDataURL(file);
    }
}

function removePhoto(inputId, imgId, btnId) {
    document.getElementById(inputId).value = '';
    const img = document.getElementById(imgId);
    const placeholder = img.previousElementSibling;
    img.src = '';
    img.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    document.getElementById(btnId).style.display = 'none';
}

// ========================================
// EVENT LISTENERS
// ========================================
function initializeEventListeners() {
    document.getElementById('addMemberForm').addEventListener('submit', handleAddMember);
    document.getElementById('searchMemberBtn').addEventListener('click', handleSearchMember);
    document.getElementById('editMemberForm').addEventListener('submit', handleUpdateMember);
    document.getElementById('deleteMemberBtn').addEventListener('click', handleDeleteMember);
    document.getElementById('cancelEditBtn').addEventListener('click', function() {
        document.getElementById('editFormContainer').style.display = 'none';
        document.getElementById('searchResults').innerHTML = '';
    });
    document.getElementById('refreshDatabaseBtn').addEventListener('click', loadDatabase);
    document.getElementById('downloadDatabaseBtn').addEventListener('click', downloadDatabase);
}

// ========================================
// UPLOAD PHOTO TO FIREBASE STORAGE
// ========================================
async function uploadPhoto(file, memberId) {
    if (!file) return null;
    
    try {
        const storageRef = storage.ref();
        const photoRef = storageRef.child(`member-photos/${memberId}-${Date.now()}.jpg`);
        await photoRef.put(file);
        const downloadURL = await photoRef.getDownloadURL();
        return downloadURL;
    } catch (error) {
        console.error('Error uploading photo:', error);
        return null;
    }
}

// ========================================
// MEMBER ID GENERATION
// ========================================
async function generateMemberId() {
    try {
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
        
        const newNumber = maxNumber + 1;
        const paddedNumber = String(newNumber).padStart(3, '0');
        return `GHCM-${paddedNumber}`;
        
    } catch (error) {
        console.error('Error generating Member ID:', error);
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
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-icon">⏳</span> Registering...';
    
    try {
        const phoneNumber = document.getElementById('phoneNumber').value;
        const phoneCheck = await db.collection(MEMBERS_COLLECTION)
            .where('phoneNumber', '==', phoneNumber)
            .get();
        
        if (!phoneCheck.empty) {
            showMessage(messageBox, 'error', '✗ Error: Phone number already exists in database');
            return;
        }
        
        const memberId = await generateMemberId();
        
        let photoURL = null;
        if (currentPhotoFile) {
            photoURL = await uploadPhoto(currentPhotoFile, memberId);
        }
        
        const memberData = {
            memberId: memberId,
            fullName: document.getElementById('fullName').value,
            gender: document.getElementById('gender').value,
            dateOfBirth: document.getElementById('dateOfBirth').value,
            maritalStatus: document.getElementById('maritalStatus').value,
            numberOfChildren: parseInt(document.getElementById('numberOfChildren').value) || 0,
            phoneNumber: phoneNumber,
            hometown: document.getElementById('hometown').value,
            residence: document.getElementById('residence').value,
            closestLandmark: document.getElementById('closestLandmark').value,
            department: document.getElementById('department').value || '',
            emergencyName: document.getElementById('emergencyName').value,
            emergencyContact: document.getElementById('emergencyContact').value,
            photoURL: photoURL,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: new Date().toISOString()
        };
        
        await db.collection(MEMBERS_COLLECTION).add(memberData);
        
        showMessage(messageBox, 'success', `✓ Member registered successfully! Member ID: ${memberId}`);
        form.reset();
        removePhoto('memberPhoto', 'photoPreviewImg', 'removePhotoBtn');
        currentPhotoFile = null;
        
        if (document.getElementById('database').classList.contains('active')) {
            loadDatabase();
        }
        
    } catch (error) {
        console.error('Error adding member:', error);
        showMessage(messageBox, 'error', '✗ Error: Failed to register member. ' + error.message);
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
            
            members.forEach(member => {
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
    
    document.getElementById('editMemberId').value = member.memberId;
    document.getElementById('editRowIndex').value = member.id;
    document.getElementById('editFullName').value = member.fullName;
    document.getElementById('editGender').value = member.gender;
    document.getElementById('editDateOfBirth').value = member.dateOfBirth;
    document.getElementById('editMaritalStatus').value = member.maritalStatus || 'Single';
    document.getElementById('editNumberOfChildren').value = member.numberOfChildren || 0;
    document.getElementById('editPhoneNumber').value = member.phoneNumber;
    document.getElementById('editHometown').value = member.hometown || '';
    document.getElementById('editResidence').value = member.residence;
    document.getElementById('editClosestLandmark').value = member.closestLandmark || '';
    document.getElementById('editDepartment').value = member.department || '';
    document.getElementById('editEmergencyName').value = member.emergencyName || '';
    document.getElementById('editEmergencyContact').value = member.emergencyContact || '';
    
    if (member.photoURL) {
        const img = document.getElementById('editPhotoPreviewImg');
        const placeholder = img.previousElementSibling;
        img.src = member.photoURL;
        img.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        document.getElementById('editRemovePhotoBtn').style.display = 'inline-flex';
    } else {
        removePhoto('editMemberPhoto', 'editPhotoPreviewImg', 'editRemovePhotoBtn');
    }
    
    currentEditPhotoFile = null;
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
        const memberId = document.getElementById('editMemberId').value;
        const phoneNumber = document.getElementById('editPhoneNumber').value;
        
        const phoneCheck = await db.collection(MEMBERS_COLLECTION)
            .where('phoneNumber', '==', phoneNumber)
            .get();
        
        if (!phoneCheck.empty && phoneCheck.docs[0].id !== docId) {
            showMessage(messageBox, 'error', '✗ Error: Phone number already exists for another member');
            return;
        }
        
        let photoURL = document.getElementById('editPhotoPreviewImg').src || null;
        if (photoURL && photoURL.startsWith('data:')) {
            photoURL = null;
        }
        
        if (currentEditPhotoFile) {
            photoURL = await uploadPhoto(currentEditPhotoFile, memberId);
        }
        
        const updatedData = {
            fullName: document.getElementById('editFullName').value,
            gender: document.getElementById('editGender').value,
            dateOfBirth: document.getElementById('editDateOfBirth').value,
            maritalStatus: document.getElementById('editMaritalStatus').value,
            numberOfChildren: parseInt(document.getElementById('editNumberOfChildren').value) || 0,
            phoneNumber: phoneNumber,
            hometown: document.getElementById('editHometown').value,
            residence: document.getElementById('editResidence').value,
            closestLandmark: document.getElementById('editClosestLandmark').value,
            department: document.getElementById('editDepartment').value || '',
            emergencyName: document.getElementById('editEmergencyName').value,
            emergencyContact: document.getElementById('editEmergencyContact').value,
            photoURL: photoURL,
            updatedAt: new Date().toISOString()
        };
        
        await db.collection(MEMBERS_COLLECTION).doc(docId).update(updatedData);
        
        showMessage(messageBox, 'success', '✓ Member updated successfully!');
        document.getElementById('editFormContainer').style.display = 'none';
        document.getElementById('searchResults').innerHTML = '';
        currentEditPhotoFile = null;
        
        document.getElementById('searchName').value = '';
        document.getElementById('searchPhone').value = '';
        document.getElementById('searchMemberId').value = '';
        
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
        
        document.getElementById('searchName').value = '';
        document.getElementById('searchPhone').value = '';
        document.getElementById('searchMemberId').value = '';
        
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
    
    tableBody.innerHTML = `
        <tr>
            <td colspan="10" class="loading-message">
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
                    <td colspan="10" class="loading-message">
                        No members registered yet. Add your first member!
                    </td>
                </tr>
            `;
            memberCount.textContent = '0';
        } else {
            let tableHTML = '';
            
            snapshot.forEach(doc => {
                const member = { id: doc.id, ...doc.data() };
                const photoHTML = member.photoURL 
                    ? `<img src="${member.photoURL}" class="member-photo-thumb" alt="${member.fullName}">`
                    : '📷';
                    
                tableHTML += `
                    <tr>
                        <td>${photoHTML}</td>
                        <td>${member.memberId}</td>
                        <td>${member.fullName}</td>
                        <td>${member.gender}</td>
                        <td>${member.maritalStatus || 'N/A'}</td>
                        <td>${member.phoneNumber}</td>
                        <td>${member.hometown || 'N/A'}</td>
                        <td>${member.residence}</td>
                        <td>${member.department || 'N/A'}</td>
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
                <td colspan="10" class="loading-message">
                    Error loading members: ${error.message}
                </td>
            </tr>
        `;
    }
}

// ========================================
// REAL-TIME UPDATES
// ========================================
function setupRealtimeListener() {
    db.collection(MEMBERS_COLLECTION).onSnapshot((snapshot) => {
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
Marital Status: ${member.maritalStatus || 'N/A'}
Number of Children: ${member.numberOfChildren || 0}
Phone Number: ${member.phoneNumber}
Hometown: ${member.hometown || 'N/A'}
Current Residence: ${member.residence}
Closest Landmark: ${member.closestLandmark || 'N/A'}
Department: ${member.department || 'N/A'}
Emergency Contact Name: ${member.emergencyName || 'N/A'}
Emergency Contact Number: ${member.emergencyContact || 'N/A'}
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
    document.querySelector('[data-tab="edit-member"]').click();
    
    document.getElementById('searchMemberId').value = member.memberId;
    
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
Member ID:              ${member.memberId}
Full Name:              ${member.fullName}
Gender:                 ${member.gender}
Date of Birth:          ${member.dateOfBirth}
Marital Status:         ${member.maritalStatus || 'N/A'}
Number of Children:     ${member.numberOfChildren || 0}
Phone Number:           ${member.phoneNumber}
Hometown:               ${member.hometown || 'N/A'}
Current Residence:      ${member.residence}
Closest Landmark:       ${member.closestLandmark || 'N/A'}
Department:             ${member.department || 'N/A'}
Emergency Contact Name: ${member.emergencyName || 'N/A'}
Emergency Contact No.:  ${member.emergencyContact || 'N/A'}
Registration Date:      ${member.createdAt || 'N/A'}
═══════════════════════════════════════════════════════════════

`;
            index++;
        });
        
        textContent += `
End of Report
Generated by: Glorious Height Charismatic Ministry Database System
Powered by Napotech & Firebase
`;
        
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
