// --- Firebase Initialization ---
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;
let userDataUnsubscribe = null; // 실시간 업데이트 리스너

// --- DOM Element References ---
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
const mainTitle = document.getElementById('main-title');
const categoryList = document.getElementById('category-list');
const newCategoryNameInput = document.getElementById('new-category-name');
const newCategoryColorInput = document.getElementById('new-category-color');
const addCategoryBtn = document.getElementById('add-category-btn');
const taskList = document.getElementById('task-list');
const newTaskInput = document.getElementById('new-task-input');
const newTaskDueDateInput = document.getElementById('new-task-due-date');
const taskCategorySelect = document.getElementById('task-category-select');
const addTaskBtn = document.getElementById('add-task-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const sortSelect = document.getElementById('sort-select');

// Auth UI
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userProfile = document.getElementById('user-profile');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const loginPrompt = document.getElementById('login-prompt');
const taskArea = document.getElementById('task-area');

// Right Panel UI
const progressText = document.getElementById('progress-text');
const progressBar = document.getElementById('progress-bar');
const pomodoroTime = document.getElementById('pomodoro-time');
const pomodoroProgress = document.getElementById('pomodoro-progress');
const pomodoroStartPauseBtn = document.getElementById('pomodoro-start-pause');
const pomodoroResetBtn = document.getElementById('pomodoro-reset');
const quoteTextElement = document.getElementById('quote-text');
const quoteAuthorElement = document.getElementById('quote-author');

// Modals & AI UI
const aiPlannerModal = document.getElementById('ai-planner-modal');
const openAiModalBtn = document.getElementById('open-ai-modal-btn');
const closeAiModalBtn = document.getElementById('close-ai-modal-btn');
const aiGoalInput = document.getElementById('ai-goal-input');
const generateTasksBtn = document.getElementById('generate-tasks-btn');
const aiSortBtn = document.getElementById('ai-sort-btn');
const magicFillBtn = document.getElementById('magic-fill-btn');
const dashboardModal = document.getElementById('dashboard-modal');
const openDashboardBtn = document.getElementById('open-dashboard-btn');
const closeDashboardBtn = document.getElementById('close-dashboard-btn');
const achievementsModal = document.getElementById('achievements-modal');
const openAchievementsBtn = document.getElementById('open-achievements-btn');
const closeAchievementsBtn = document.getElementById('close-achievements-btn');

// Chart & Notification UI
const weeklyProgressChartCtx = document.getElementById('weekly-progress-chart');
const categoryDistributionChartCtx = document.getElementById('category-distribution-chart');
let weeklyProgressChart, categoryDistributionChart;
const achievementsList = document.getElementById('achievements-list');
const streakDisplay = document.getElementById('streak-display');
const notificationContainer = document.getElementById('notification-container');


// --- App State ---
let tasks = [];
let categories = [];
let gamificationState = { unlocked: [], lastVisitDate: null, streak: 0 };
let selectedCategoryId = 'all';
let currentSort = 'createdAt';

const achievementList = {
    FIRST_STEP: { name: '첫 걸음', description: '첫 번째 할 일을 완료했습니다!', icon: 'fa-shoe-prints' },
    FIVE_A_DAY: { name: '열정맨', description: '하루에 5개의 할 일을 완료했습니다!', icon: 'fa-fire' },
    STREAK_3: { name: '작심삼일 돌파', description: '3일 연속으로 플래너에 접속했습니다!', icon: 'fa-calendar-check' },
    CAT_MASTER: { name: '정리의 신', description: '새로운 카테고리를 3개 만들었습니다!', icon: 'fa-sitemap' }
};

const quotes = [
    { text: "가장 큰 영광은 한 번도 실패하지 않음이 아니라 실패할 때마다 다시 일어서는 데에 있다.", author: "공자" },
    { text: "성공의 비결은 단 한 가지, 잘할 수 있는 일에 광적으로 집중하는 것이다.", author: "톰 모나건" },
    { text: "미래를 예측하는 가장 좋은 방법은 미래를 창조하는 것이다.", author: "피터 드러커" },
];


// --- AUTHENTICATION ---
auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
        setUIStateForLoggedIn(user);
        loadDataFromFirestore();
    } else {
        if (userDataUnsubscribe) userDataUnsubscribe();
        setUIStateForLoggedOut();
        resetLocalData();
        renderAll();
    }
});

function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => console.error("Login failed:", error));
}

function logout() {
    auth.signOut().catch(error => console.error("Logout failed:", error));
}


// --- UI STATE MANAGEMENT (Corrected) ---
function setUIStateForLoggedIn(user) {
    loginBtn.classList.add('hidden');
    userProfile.classList.remove('hidden');
    userProfile.classList.add('flex');
    userAvatar.src = user.photoURL;
    userName.textContent = user.displayName;
    loginPrompt.classList.add('hidden');
    taskArea.classList.remove('hidden');
    
    document.querySelectorAll('[data-auth-required]').forEach(el => el.disabled = false);
}

function setUIStateForLoggedOut() {
    loginBtn.classList.remove('hidden');
    userProfile.classList.add('hidden');
    userProfile.classList.remove('flex');
    loginPrompt.classList.remove('hidden');
    taskArea.classList.add('hidden');
    
    document.querySelectorAll('[data-auth-required]').forEach(el => el.disabled = true);
    streakDisplay.classList.add('hidden');
}

function resetLocalData() {
    tasks = [];
    categories = [];
    gamificationState = { unlocked: [], lastVisitDate: null, streak: 0 };
    selectedCategoryId = 'all';
}


// --- DATA MANAGEMENT (Firestore) ---
function loadDataFromFirestore() {
    if (!currentUser) return;
    const userDocRef = db.collection('users').doc(currentUser.uid);

    userDataUnsubscribe = userDocRef.onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            tasks = data.tasks || [];
            categories = data.categories || [{id: "default", name: "일반", color: "#3b82f6"}];
            gamificationState = data.gamification || { unlocked: [], lastVisitDate: null, streak: 0 };

            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            let needsSave = false;

            if (gamificationState.lastVisitDate !== today) {
                if (gamificationState.lastVisitDate === yesterday) {
                    gamificationState.streak++;
                } else {
                    gamificationState.streak = 1;
                }
                gamificationState.lastVisitDate = today;
                needsSave = true;
            }
            
            updateStreakDisplay();
            checkAchievements('STREAK_3', () => gamificationState.streak >= 3);
            if (needsSave) saveDataToFirestore();
            
        } else {
            const initialData = {
                tasks: [], categories: [{id: "default", name: "일반", color: "#3b82f6"}],
                gamification: { unlocked: [], lastVisitDate: new Date().toISOString().split('T')[0], streak: 1 }
            };
            userDocRef.set(initialData);
        }
        renderAll();
    }, error => console.error("Error listening to user data:", error));
}

async function saveDataToFirestore() {
    if (!currentUser) return;
    const userDocRef = db.collection('users').doc(currentUser.uid);
    try {
        const cleanTasks = tasks.map(task => ({...task, completedAt: task.completedAt || null}));
        await userDocRef.set({ tasks: cleanTasks, categories, gamification: gamificationState }, { merge: true });
    } catch (error) {
        console.error("Error saving data to Firestore:", error);
    }
}


// --- RENDERING ---
function renderAll() {
    renderCategories();
    renderTasks();
    updateProgress();
}

function renderCategories() {
    categoryList.innerHTML = `<div class="category-item p-2.5 rounded-lg cursor-pointer flex items-center ${selectedCategoryId === 'all' ? 'bg-sky-500/20 text-sky-400 font-semibold' : 'hover:bg-slate-700'}" data-id="all"><i class="fa-solid fa-inbox w-5 mr-3"></i><span>모든 할 일</span></div>`;
    taskCategorySelect.innerHTML = '<option value="" disabled selected>카테고리 선택</option>';
    categories.forEach(cat => {
        const catElement = document.createElement('div');
        catElement.className = `category-item group flex justify-between items-center p-2.5 rounded-lg cursor-pointer ${selectedCategoryId === cat.id ? 'bg-sky-500/20 text-sky-400 font-semibold' : 'hover:bg-slate-700'}`;
        catElement.dataset.id = cat.id;
        catElement.innerHTML = `<span class="flex items-center"><span class="inline-block w-2.5 h-2.5 rounded-full mr-3" style="background-color: ${cat.color};"></span><span>${cat.name}</span></span><button class="delete-category-btn text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" data-id="${cat.id}">&times;</button>`;
        categoryList.appendChild(catElement);

        const optionElement = document.createElement('option');
        optionElement.value = cat.id;
        optionElement.textContent = cat.name;
        taskCategorySelect.appendChild(optionElement);
    });
}

function renderTasks() {
    let filteredTasks = selectedCategoryId === 'all' ? tasks : tasks.filter(task => task.categoryId === selectedCategoryId);

    if (currentSort !== 'ai') {
        filteredTasks.sort((a, b) => {
            if (currentSort === 'dueDate') return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31');
            return (b.createdAt || 0) - (a.createdAt || 0);
        });
    }

    if (filteredTasks.length === 0) {
        taskList.innerHTML = `<p class="text-center text-[var(--text-secondary)] py-8">${currentUser ? '할 일이 없습니다. 하나 추가해보세요!' : ''}</p>`;
        return;
    }
    
    taskList.innerHTML = filteredTasks.map(task => {
        const category = categories.find(c => c.id === task.categoryId);
        const isOverdue = task.dueDate && new Date(task.dueDate) < new Date().setHours(0,0,0,0);
        
        return `
            <div class="task-item flex items-center p-4 bg-[var(--bg-primary)] rounded-xl shadow-sm border border-[var(--border-primary)] ${task.completed ? 'completed' : ''}" data-id="${task.id}">
                <input type="checkbox" class="h-5 w-5 bg-transparent text-[var(--accent-secondary)] rounded-md border-slate-600 focus:ring-0 focus:ring-offset-0 cursor-pointer" ${task.completed ? 'checked' : ''}>
                <span class="task-text flex-1 ml-4 font-medium">${task.text}</span>
                <button class="ml-auto mr-2 text-[var(--text-secondary)] hover:text-sky-400 first-step-btn" title="AI 첫 걸음 제안"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
                ${task.pomodoros ? `<span class="text-xs font-semibold text-[var(--text-secondary)] mx-2" title="예상 뽀모도로 세션">🍅&times;${task.pomodoros}</span>` : ''}
                ${task.dueDate ? `<span class="text-xs font-semibold ${isOverdue && !task.completed ? 'text-red-400' : 'text-[var(--text-secondary)]'} mx-2">${new Date(task.dueDate).toLocaleDateString()}</span>` : ''}
                ${category ? `<span class="text-xs font-semibold text-white py-1 px-2.5 rounded-full" style="background-color: ${category.color};">${category.name}</span>` : ''}
                <button class="ml-4 text-[var(--text-secondary)] hover:text-red-500 delete-task-btn"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
    }).join('');
}

function updateProgress() {
    if (!progressText) return;
    const today = new Date().setHours(0, 0, 0, 0);
    const todayTasks = tasks.filter(t => t.createdAt && new Date(t.createdAt).setHours(0, 0, 0, 0) === today);

    const totalTasks = todayTasks.length;
    const completedTasks = todayTasks.filter(t => t.completed).length;
    const percentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    progressText.textContent = `오늘 총 ${totalTasks}개 할 일, ${completedTasks}개 완료.`;
    progressBar.style.width = `${percentage}%`;
}

function displayRandomQuote() {
    if (!quoteTextElement) return;
    const randomIndex = Math.floor(Math.random() * quotes.length);
    const randomQuote = quotes[randomIndex];
    quoteTextElement.textContent = `"${randomQuote.text}"`;
    quoteAuthorElement.textContent = `- ${randomQuote.author}`;
}

// --- EVENT LISTENERS ---
if (loginBtn) loginBtn.addEventListener('click', loginWithGoogle);
if (logoutBtn) logoutBtn.addEventListener('click', logout);
if (menuToggle) menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
if (themeToggleBtn) themeToggleBtn.addEventListener('click', () => {
    document.documentElement.classList.toggle('light');
    const isLight = document.documentElement.classList.contains('light');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    themeToggleBtn.innerHTML = isLight ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
});
if (sortSelect) sortSelect.addEventListener('change', e => { currentSort = e.target.value; renderTasks(); });

if (addCategoryBtn) addCategoryBtn.addEventListener('click', () => {
    if (!currentUser) return;
    const name = newCategoryNameInput.value.trim();
    if (name) {
        categories.push({ id: db.collection('users').doc().id, name, color: newCategoryColorInput.value });
        newCategoryNameInput.value = '';
        saveDataToFirestore(); 
        checkAchievements('CAT_MASTER', () => categories.length >= 4);
    }
});

if (addTaskBtn) addTaskBtn.addEventListener('click', () => {
    if (!currentUser) return;
    const text = newTaskInput.value.trim();
    const categoryId = taskCategorySelect.value;
    const dueDate = newTaskDueDateInput.value;
    if (text && categoryId) {
        tasks.push({ id: db.collection('users').doc().id, text, categoryId, dueDate, completed: false, createdAt: Date.now() });
        newTaskInput.value = ''; newTaskDueDateInput.value = '';
        saveDataToFirestore();
    } else if (!categoryId) {
        taskCategorySelect.classList.add('shake');
        setTimeout(() => taskCategorySelect.classList.remove('shake'), 820);
    }
});

if (categoryList) categoryList.addEventListener('click', e => {
    const categoryItem = e.target.closest('.category-item');
    if (categoryItem) {
        selectedCategoryId = categoryItem.dataset.id;
        mainTitle.textContent = selectedCategoryId === 'all' ? '모든 할 일' : categories.find(c => c.id === selectedCategoryId)?.name || '모든 할 일';
        if (sidebar.classList.contains('open')) sidebar.classList.remove('open');
        renderAll();
    }
    const deleteBtn = e.target.closest('.delete-category-btn');
    if (deleteBtn) {
        const catId = deleteBtn.dataset.id;
        categories = categories.filter(c => c.id !== catId);
        tasks = tasks.filter(t => t.categoryId !== catId);
        if (selectedCategoryId === catId) { selectedCategoryId = 'all'; mainTitle.textContent = '모든 할 일'; }
        saveDataToFirestore();
    }
});

if (taskList) taskList.addEventListener('click', async (e) => {
    if (!currentUser) return;
    const taskElement = e.target.closest('.task-item');
    if (!taskElement) return;
    const taskId = taskElement.dataset.id;
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;
    const task = tasks[taskIndex];

    if (e.target.type === 'checkbox') {
        task.completed = e.target.checked;
        if(task.completed) {
            task.completedAt = Date.now();
            checkAchievements('FIRST_STEP', () => tasks.filter(t => t.completed).length === 1);
            checkAchievements('FIVE_A_DAY', () => {
                const todayStr = new Date().toISOString().split('T')[0];
                return tasks.filter(t => t.completedAt && new Date(t.completedAt).toISOString().split('T')[0] === todayStr).length >= 5;
            });
        }
        else delete task.completedAt;
        saveDataToFirestore();
    }
    
    if (e.target.closest('.delete-task-btn')) {
        tasks.splice(taskIndex, 1);
        saveDataToFirestore();
    }

    const firstStepBtn = e.target.closest('.first-step-btn');
    if (firstStepBtn) {
        const icon = firstStepBtn.querySelector('i');
        icon.classList.remove('fa-wand-magic-sparkles'); icon.classList.add('fa-spinner', 'animate-spin');
        firstStepBtn.disabled = true;
        try {
            const response = await fetch('/get_first_step', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task_text: task.text })
            });
            if (!response.ok) throw new Error("AI 제안을 받아오지 못했습니다.");
            const data = await response.json();
            alert(`💡 AI 첫 걸음 제안\n\n${data.first_step}`);
        } catch (error) {
            alert(error.message);
        } finally {
            icon.classList.add('fa-wand-magic-sparkles'); icon.classList.remove('fa-spinner', 'animate-spin');
            firstStepBtn.disabled = false;
        }
    }
});

// --- MODAL & AI LOGIC ---
function openModal(modal) { 
    if (currentUser) { 
        modal.classList.remove('opacity-0', 'pointer-events-none'); 
        modal.querySelector('.modal-content').classList.remove('scale-95'); 
    } 
}
function closeModal(modal) { 
    modal.classList.add('opacity-0', 'pointer-events-none'); 
    modal.querySelector('.modal-content').classList.add('scale-95'); 
}

/* ✅ 고정 매핑: 버튼 id → 모달 id */
const buttonToModalMap = {
  'open-ai-modal-btn': 'ai-planner-modal',
  'open-dashboard-btn': 'dashboard-modal',
  'open-achievements-btn': 'achievements-modal',
};

/* ✅ 리스너: 매핑을 사용해 정확한 모달을 연다 */
[openAiModalBtn, openDashboardBtn, openAchievementsBtn].forEach(btn => {
  if (!btn) return;
  btn.addEventListener('click', () => {
    const modalId = buttonToModalMap[btn.id];
    const modal = document.getElementById(modalId);
    if (!modal) return;

    if (modalId === 'dashboard-modal') renderDashboard();
    if (modalId === 'achievements-modal') renderAchievements();
    openModal(modal);
  });
});

[closeAiModalBtn, closeDashboardBtn, closeAchievementsBtn].forEach(btn => {
  if (!btn) return;
  btn.addEventListener('click', () => closeModal(btn.closest('.modal')));
});

[aiPlannerModal, dashboardModal, achievementsModal].forEach(modal => {
  if (!modal) return;
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(modal); });
});
// --- AI 플래너: Enter로 실행 ---
// IME(한글) 조합 중 Enter 입력을 구분하기 위한 플래그
let aiGoalIsComposing = false;

if (aiGoalInput) {
  aiGoalInput.addEventListener('compositionstart', () => { aiGoalIsComposing = true; });
  aiGoalInput.addEventListener('compositionend', () => { aiGoalIsComposing = false; });

  aiGoalInput.addEventListener('keydown', (e) => {
    // Shift+Enter는 줄바꿈 허용 (textarea인 경우)
    if (e.key === 'Enter' && !e.shiftKey) {
      // 한글 조합 중이거나 버튼 비활성화면 실행 안 함
      if (aiGoalIsComposing) return;
      if (!currentUser) return;                 // 로그인 필요 로직 유지
      if (!generateTasksBtn || generateTasksBtn.disabled) return;

      e.preventDefault();                       // 폼 제출/줄바꿈 방지
      generateTasksBtn.click();                 // 버튼 클릭과 동일 동작
    }
  });
}


if (generateTasksBtn) generateTasksBtn.addEventListener('click', async () => {
    const goal = aiGoalInput.value.trim();
    if (!goal || !currentUser) return;

    const btnText = generateTasksBtn.querySelector('.btn-text');
    const spinner = generateTasksBtn.querySelector('.spinner');
    btnText.classList.add('hidden'); spinner.classList.remove('hidden'); generateTasksBtn.disabled = true;

    try {
        const response = await fetch('/generate_tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal, includePomodoro: document.getElementById('ai-include-pomodoro').checked })
        });
        if (!response.ok) throw new Error('AI 작업 생성에 실패했습니다.');
        const data = await response.json();
        
        const defaultCategory = categories.find(c => c.id === 'default') || categories[0];
        if (!defaultCategory) { alert('기본 카테고리가 존재하지 않습니다.'); return; }
        
        const newTasks = data.tasks.map(task => ({
            ...task,
            id: db.collection('users').doc().id,
            completed: false,
            createdAt: Date.now(),
            categoryId: defaultCategory.id,
            dueDate: ''
        }));
        tasks.push(...newTasks);
        saveDataToFirestore(); 
        closeModal(aiPlannerModal); 
        aiGoalInput.value = '';

    } catch (error) {
        alert(error.message);
    } finally {
        btnText.classList.remove('hidden'); spinner.classList.add('hidden'); generateTasksBtn.disabled = false;
    }
});

if (aiSortBtn) aiSortBtn.addEventListener('click', async () => {
    if (!currentUser) return;
    const currentTasks = selectedCategoryId === 'all' ? tasks.filter(t => !t.completed) : tasks.filter(task => task.categoryId === selectedCategoryId && !task.completed);
    if (currentTasks.length < 2) { alert("정렬할 미완료 할 일이 2개 이상 필요합니다."); return; }

    aiSortBtn.textContent = "AI 분석 중..."; aiSortBtn.disabled = true;
    try {
        const response = await fetch('/prioritize_tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks: currentTasks })
        });
        if (!response.ok) throw new Error('AI 순서 추천에 실패했습니다.');
        const data = await response.json();
        const sortedIds = data.sorted_ids;

        const sortedTasks = currentTasks.sort((a, b) => sortedIds.indexOf(a.id) - sortedIds.indexOf(b.id));
        const otherTasks = tasks.filter(t => !currentTasks.includes(t));
        tasks = [...sortedTasks, ...otherTasks];
        
        currentSort = 'ai';
        saveDataToFirestore();
    } catch (error) {
        alert(error.message);
    } finally {
        aiSortBtn.textContent = "AI 추천 순서 ✨"; aiSortBtn.disabled = false;
    }
});

if (magicFillBtn) magicFillBtn.addEventListener('click', async () => {
    if (!currentUser) return;
    const userInput = newTaskInput.value.trim();
    if (!userInput) { newTaskInput.classList.add('shake'); setTimeout(() => newTaskInput.classList.remove('shake'), 820); return; }
    
    const btnText = magicFillBtn.querySelector('.btn-text');
    const icon = magicFillBtn.querySelector('i');
    const spinner = magicFillBtn.querySelector('.spinner');
    btnText.classList.add('hidden'); icon.classList.add('hidden'); spinner.classList.remove('hidden');
    magicFillBtn.disabled = true;

    try {
        const response = await fetch('/parse_task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_input: userInput })
        });
        if (!response.ok) throw new Error('AI 분석에 실패했습니다.');
        const data = await response.json();

        newTaskInput.value = data.text || userInput;
        newTaskDueDateInput.value = data.dueDate || '';
        
        const foundCategory = categories.find(c => c.name.toLowerCase() === (data.categoryName || '').toLowerCase());
        taskCategorySelect.value = foundCategory ? foundCategory.id : (categories[0]?.id || '');

    } catch (error) {
        alert(error.message);
    } finally {
        btnText.classList.remove('hidden'); icon.classList.remove('hidden'); spinner.classList.add('hidden');
        magicFillBtn.disabled = false;
    }
});


// --- GAMIFICATION & DASHBOARD LOGIC ---
function updateStreakDisplay() {
    if (gamificationState.streak > 1) {
        streakDisplay.innerHTML = `<i class="fa-solid fa-fire text-orange-400"></i> ${gamificationState.streak}일 연속 달성 중!`;
        streakDisplay.classList.remove('hidden');
    } else {
        streakDisplay.classList.add('hidden');
    }
}
function checkAchievements(achievementId, condition) {
    if (!gamificationState.unlocked.includes(achievementId) && condition()) {
        gamificationState.unlocked.push(achievementId);
        saveDataToFirestore();
        showAchievementNotification(achievementId);
    }
}
function showAchievementNotification(achievementId) {
    const achievement = achievementList[achievementId];
    if (!achievement) return;
    const toast = document.createElement('div');
    toast.className = 'toast bg-amber-500 text-white p-4 rounded-lg shadow-lg flex items-center gap-4';
    toast.innerHTML = `<i class="fa-solid ${achievement.icon} text-2xl"></i><div><p class="font-bold">업적 달성: ${achievement.name}</p><p class="text-sm">${achievement.description}</p></div>`;
    notificationContainer.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 5000);
}
function renderAchievements() {
    if (!gamificationState.unlocked || gamificationState.unlocked.length === 0) {
        achievementsList.innerHTML = '<p class="text-center text-[var(--text-secondary)] py-8">아직 달성한 업적이 없습니다.</p>';
        return;
    }
    achievementsList.innerHTML = gamificationState.unlocked.map(id => {
        const achievement = achievementList[id];
        return `<div class="flex items-center p-4 bg-[var(--bg-tertiary)] rounded-lg"><i class="fa-solid ${achievement.icon} text-3xl text-amber-400 w-12 text-center"></i><div class="ml-4"><p class="font-bold text-[var(--text-primary)]">${achievement.name}</p><p class="text-sm text-[var(--text-secondary)]">${achievement.description}</p></div></div>`;
    }).join('');
}
function renderDashboard() {
    const weeklyData = { labels: [], data: [0, 0, 0, 0, 0, 0, 0] };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today); date.setDate(today.getDate() - i);
        weeklyData.labels.push(['일', '월', '화', '수', '목', '금', '토'][date.getDay()]);
    }
    tasks.filter(t => t.completed && t.completedAt).forEach(task => {
        const completedDate = new Date(task.completedAt); completedDate.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today - completedDate) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays < 7) weeklyData.data[6 - diffDays]++;
    });

    const categoryData = { labels: [], data: [], colors: [] };
    const categoryCounts = {};
    tasks.forEach(task => {
        const category = categories.find(c => c.id === task.categoryId);
        const categoryName = category ? category.name : '미분류';
        categoryCounts[categoryName] = (categoryCounts[categoryName] || 0) + 1;
    });
    for (const [name, count] of Object.entries(categoryCounts)) {
        categoryData.labels.push(name); categoryData.data.push(count);
        const category = categories.find(c => c.name === name);
        categoryData.colors.push(category ? category.color : '#64748b');
    }

    const isDarkMode = !document.documentElement.classList.contains('light');
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const textColor = isDarkMode ? '#f1f5f9' : '#1e293b';

    if(weeklyProgressChart) weeklyProgressChart.destroy();
    if(categoryDistributionChart) categoryDistributionChart.destroy();

    weeklyProgressChart = new Chart(weeklyProgressChartCtx, { type: 'bar', data: { labels: weeklyData.labels, datasets: [{ label: '완료한 할 일', data: weeklyData.data, backgroundColor: '#38bdf8', borderRadius: 5 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } }, x: { ticks: { color: textColor }, grid: { display: false } } } } });
    categoryDistributionChart = new Chart(categoryDistributionChartCtx, { type: 'pie', data: { labels: categoryData.labels, datasets: [{ data: categoryData.data, backgroundColor: categoryData.colors, borderColor: isDarkMode ? '#0f172a' : '#f8fafc', borderWidth: 2 }] }, options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: textColor } } } } });
}

// --- POMODORO TIMER LOGIC ---
let timerInterval;
let totalSeconds = 25 * 60;
let isPaused = true;
if (pomodoroProgress) {
    const radius = pomodoroProgress.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    pomodoroProgress.style.strokeDasharray = `${circumference} ${circumference}`;

    function updateTimerDisplay() {
        if (!pomodoroTime) return;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        pomodoroTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        const progress = (25 * 60 - totalSeconds) / (25 * 60);
        pomodoroProgress.style.strokeDashoffset = circumference - progress * circumference;
    }
    function startPauseTimer() {
        isPaused = !isPaused;
        pomodoroStartPauseBtn.textContent = isPaused ? '시작' : '정지';
        if (!isPaused) {
            timerInterval = setInterval(() => {
                if (totalSeconds > 0) { totalSeconds--; updateTimerDisplay(); } 
                else { clearInterval(timerInterval); new Notification("시간 종료! 휴식을 취하세요."); resetTimer(); }
            }, 1000);
        } else { clearInterval(timerInterval); }
    }
    function resetTimer() {
        clearInterval(timerInterval); isPaused = true;
        pomodoroStartPauseBtn.textContent = '시작';
        totalSeconds = 25 * 60; updateTimerDisplay();
    }
    if (pomodoroStartPauseBtn) pomodoroStartPauseBtn.addEventListener('click', startPauseTimer);
    if (pomodoroResetBtn) pomodoroResetBtn.addEventListener('click', resetTimer);
}

// --- INITIALIZATION ---
function initializeApp() {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme) document.documentElement.classList.add(storedTheme);
    if (themeToggleBtn) {
        themeToggleBtn.innerHTML = document.documentElement.classList.contains('light') ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    }
    
    if (Notification.permission !== "granted") Notification.requestPermission();
    // ✅ updateTimerDisplay가 정의되어 있을 때만 호출 (스코프 안전)
    if (typeof updateTimerDisplay === 'function') updateTimerDisplay();
    
    displayRandomQuote();
    
    setUIStateForLoggedOut();
    renderAll();
}

initializeApp();
