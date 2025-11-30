/* ==========================================================================
   [1] Firebase 설정 및 라이브러리 임포트
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, updateDoc, doc, query, where, orderBy, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ★ 중요: 본인의 Firebase 키값으로 꼭 변경해주세요!
const firebaseConfig = {
    apiKey: "AIzaSyA250TRzQCM9FMqiXBROX3IknKE1FZp5rc", 
    authDomain: "pharmacy-order-5ddc5.firebaseapp.com",
    projectId: "pharmacy-order-5ddc5",
    storageBucket: "pharmacy-order-5ddc5.firebasestorage.app", 
    messagingSenderId: "713414389922",
    appId: "1:713414389922:web:606452de8b27fe847ca7fb"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
console.log("🔥 Firebase Connected!");


/* ==========================================================================
   [2] 전역 변수 선언
   ========================================================================== */
// 주문 관련
let currentProduct = null;      
let currentQty = 1;             
let currentOptionPrice = 0;     
let currentOptionId = null;     
let cartItems = [];             

// 실행 취소 관련
let deletedItemBackup = null;   
let undoTimeout = null;         

// 달력/기록 관련
let calDate = new Date(); 
let selectedDateStr = null; 

// 관리자 관련
let currentSupplierId = null;
let editingProductId = null; 
let allProductsData = []; // 검색용 데이터 캐싱

// 사진 요청 관련
let currentPhotoReqId = null; 


/* ==========================================================================
   [3] 데이터 불러오기 (상품 목록)
   ========================================================================== */
async function loadProducts() {
    const listContainer = document.getElementById('product-list');
    
    if(listContainer) listContainer.innerHTML = "<div style='padding:20px; text-align:center'>로딩중...</div>";

    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        let products = [];
        querySnapshot.forEach(doc => {
            products.push({ id: doc.id, ...doc.data() });
        });

        allProductsData = products; // 검색을 위해 저장

        renderMainTree(products); 
        renderAdminList(products); 

    } catch (error) { console.error("Error:", error); }
}


/* ==========================================================================
   [4] 좌측 메인 트리 & 검색 기능
   ========================================================================== */
function renderMainTree(productsToRender) {
    const listContainer = document.getElementById('product-list');
    if(!listContainer) return;

    const tree = {};
    productsToRender.forEach(p => {
        const cat = p.category || "기타";
        const comp = p.company || "미지정";
        if (!tree[cat]) tree[cat] = {};
        if (!tree[cat][comp]) tree[cat][comp] = [];
        tree[cat][comp].push(p);
    });

    listContainer.innerHTML = ""; 
    
    // 검색 중인지 확인 (전체 개수와 다르면 검색 중)
    const isSearchMode = (productsToRender.length < allProductsData.length) && (productsToRender.length > 0);

    const fixedOrder = ["전문의약품", "일반의약품", "의약외품"];
    const allCategories = Object.keys(tree);
    const sortedCategories = [
        ...fixedOrder.filter(key => allCategories.includes(key)),
        ...allCategories.filter(key => !fixedOrder.includes(key)).sort()
    ];

    if(productsToRender.length === 0) {
        listContainer.innerHTML = "<div style='padding:20px; text-align:center; color:#ccc;'>검색 결과가 없습니다.</div>";
        return;
    }

    sortedCategories.forEach(categoryName => {
        const catDiv = document.createElement("div");
        catDiv.className = "tree-node tree-depth-0 tree-toggle"; 
        catDiv.textContent = categoryName;
        
        const catChildContainer = document.createElement("div");
        catChildContainer.style.display = isSearchMode ? "block" : "none"; 
        if(isSearchMode) catDiv.classList.add('open');

        catDiv.addEventListener("click", () => {
            catDiv.classList.toggle("open");
            catChildContainer.style.display = catChildContainer.style.display === "none" ? "block" : "none";
        });
        listContainer.appendChild(catDiv);
        listContainer.appendChild(catChildContainer);

        const companies = tree[categoryName];
        Object.keys(companies).sort().forEach(companyName => {
            const compDiv = document.createElement("div");
            compDiv.className = "tree-node tree-depth-1 tree-toggle";
            compDiv.textContent = companyName;
            
            const compChildContainer = document.createElement("div");
            compChildContainer.style.display = isSearchMode ? "block" : "none";
            if(isSearchMode) compDiv.classList.add('open');

            compDiv.addEventListener("click", (e) => {
                e.stopPropagation(); 
                compDiv.classList.toggle("open");
                compChildContainer.style.display = compChildContainer.style.display === "none" ? "block" : "none";
            });
            catChildContainer.appendChild(compDiv);
            catChildContainer.appendChild(compChildContainer);

            const itemList = companies[companyName];
            itemList.sort((a, b) => a.name.localeCompare(b.name));

            itemList.forEach(item => {
                const itemDiv = document.createElement("div");
                itemDiv.className = "tree-node tree-depth-2";
                itemDiv.setAttribute("data-id", item.id);
                let displayName = item.name;
                if(item.stock === false) displayName = `<span style="color:red">[품절]</span> ${item.name}`;
                itemDiv.innerHTML = displayName;
                itemDiv.addEventListener("click", () => focusProductInTree(item));
                compChildContainer.appendChild(itemDiv);
            });
        });
    });
}

// 상단 통합 검색창 리스너
const mainSearchInput = document.getElementById('main-search-input');
if(mainSearchInput) {
    mainSearchInput.addEventListener('input', (e) => {
        const keyword = e.target.value.toLowerCase().trim();
        
        if(keyword.length > 0) {
            const orderTab = document.querySelector('.menu-item[data-target="order-mgmt"]');
            if(orderTab) orderTab.click();
        } else {
            renderMainTree(allProductsData);
            return;
        }

        if(!allProductsData || allProductsData.length === 0) return;

        const filtered = allProductsData.filter(p => 
            (p.name && p.name.toLowerCase().includes(keyword)) || 
            (p.company && p.company.toLowerCase().includes(keyword)) ||
            (p.category && p.category.toLowerCase().includes(keyword))
        );

        renderMainTree(filtered);
    });
}

function focusProductInTree(product, optionId = null) {
    // 사진 매칭 로직 제거됨 (단순 이동)
    displayOrderForm(product, optionId);
    setTimeout(() => {
        const targetNode = document.querySelector(`.tree-node[data-id="${product.id}"]`);
        if(targetNode) {
            document.querySelectorAll('.tree-node.active-node').forEach(n => n.classList.remove('active-node'));
            targetNode.classList.add('active-node');
            let parent = targetNode.parentElement;
            while(parent) {
                if(parent.id === 'product-list') break;
                if(parent.style.display === 'none') {
                    parent.style.display = 'block';
                    const toggleBtn = parent.previousElementSibling;
                    if(toggleBtn && toggleBtn.classList.contains('tree-toggle')) toggleBtn.classList.add('open');
                }
                parent = parent.parentElement;
            }
            targetNode.scrollIntoView({behavior: "smooth", block: "center"});
        }
    }, 100);
}


/* ==========================================================================
   [5] 중앙 상세화면 (주문 폼)
   ========================================================================== */
function displayOrderForm(item, targetOptionId = null) {
    currentProduct = item; 
    currentQty = 1; 

    document.getElementById('detail-empty').style.display = 'none';
    document.getElementById('detail-content').style.display = 'flex'; 
    document.getElementById('detail-category').textContent = item.category;
    document.getElementById('detail-name').textContent = item.name;
    document.getElementById('detail-company').textContent = item.company;

    // 헤더 초기화 (사진매칭 스타일 제거)
    const header = document.querySelector('.order-header');
    header.style.backgroundColor = "transparent";
    header.style.border = "none";

    const optionContainer = document.getElementById('option-list-container');
    optionContainer.innerHTML = ""; 

    const options = item.options || []; 

    if(options.length === 0) {
        optionContainer.innerHTML = "<div style='padding:20px; color:#aaa; text-align:center;'>옵션 없음</div>";
        document.getElementById('order-total-price').textContent = "0원";
        return;
    }

    options.forEach((opt, index) => {
        const card = document.createElement('div');
        card.className = 'option-card';
        const lastOrderHtml = opt.lastOrder ? `<div style="font-size:0.8rem; color:#aaa; margin-top:4px;">최근: ${opt.lastOrder}</div>` : "";
        
        card.innerHTML = `
            <div style="flex:1;">
                <div class="option-name" style="font-size:1rem;">${opt.name}</div>
                ${lastOrderHtml}
            </div>
            <div style="text-align:right;">
                <div class="option-price" style="font-weight:bold;">${Number(opt.price).toLocaleString()}원</div>
            </div>
        `;

        let isSelected = false;
        if(targetOptionId) { if(opt.id === targetOptionId) isSelected = true; } else { if(index === 0) isSelected = true; }

        if(isSelected) { card.classList.add('selected'); currentOptionPrice = Number(opt.price); currentOptionId = opt.id; }

        card.addEventListener('click', () => {
            document.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            currentQty = 1; document.getElementById('order-qty').value = 1;
            currentOptionPrice = Number(opt.price); currentOptionId = opt.id; 
            updateTotalPrice();
        });
        optionContainer.appendChild(card);
    });
    
    if(options.length > 0 && !targetOptionId) {
        currentOptionPrice = Number(options[0].price);
        currentOptionId = options[0].id;
    }
    
    document.getElementById('order-qty').value = 1;
    updateTotalPrice();
}

function updateTotalPrice() {
    const total = currentOptionPrice * currentQty;
    const totalEl = document.getElementById('order-total-price');
    if(totalEl) totalEl.textContent = total.toLocaleString() + "원";
}

// 수량 조절 버튼 및 입력
document.getElementById('qty-plus').addEventListener('click', () => { currentQty++; document.getElementById('order-qty').value = currentQty; updateTotalPrice(); });
document.getElementById('qty-minus').addEventListener('click', () => { if(currentQty > 1) currentQty--; document.getElementById('order-qty').value = currentQty; updateTotalPrice(); });
document.getElementById('order-qty').addEventListener('input', function() {
    let val = parseInt(this.value);
    if(isNaN(val) || val < 1) val = 1; 
    currentQty = val; updateTotalPrice();
});


/* ==========================================================================
   [6] 장바구니 로직
   ========================================================================== */
const btnAddCart = document.getElementById('btn-add-cart');
if(btnAddCart) btnAddCart.addEventListener('click', async () => {
    if(!currentProduct || !currentOptionId) return;
    
    const selectedOptionEl = document.querySelector('.option-card.selected');
    const optionName = selectedOptionEl ? selectedOptionEl.querySelector('.option-name').textContent : "기본옵션";
    
    const newItem = { 
        cartId: Date.now(), 
        optionId: currentOptionId, 
        product: currentProduct, 
        optionName: optionName, 
        qty: currentQty, 
        unitPrice: currentOptionPrice, 
        totalPrice: currentOptionPrice * currentQty
    };

    // 장바구니 중복 확인 (같은 옵션이면 합침)
    const existingIndex = cartItems.findIndex(i => i.optionId === currentOptionId);
    
    if(existingIndex !== -1) {
        cartItems[existingIndex].qty += currentQty;
        cartItems[existingIndex].totalPrice = cartItems[existingIndex].unitPrice * cartItems[existingIndex].qty;
    } else {
        cartItems.push(newItem);
    }
    
    renderCart(currentOptionId);
});

function renderCart(highlightId = null) {
    const cartList = document.getElementById('cart-list');
    const totalEl = document.getElementById('cart-total-price');
    const countEl = document.getElementById('cart-count');
    cartList.innerHTML = ""; let totalAmount = 0;

    if(cartItems.length === 0) cartList.innerHTML = "<div style='padding:40px 20px; text-align:center; color:#ccc; font-size:0.9rem;'>비어있음</div>";

    cartItems.forEach((item, index) => {
        totalAmount += item.totalPrice;
        const div = document.createElement('div');
        div.className = 'cart-item-card';
        if(highlightId && item.optionId === highlightId) div.classList.add('highlight');
        
        div.addEventListener('dblclick', () => {
            document.querySelector('.menu-item[data-target="order-mgmt"]').click();
            focusProductInTree(item.product, item.optionId);
        });
        div.title = "더블클릭: 해당 상품으로 이동";

        div.innerHTML = `
            <div class="cart-item-left">
                <div class="cart-item-title" style="display:flex; align-items:center; gap:5px;">
                    ${item.product.name} 
                    <span style="font-size:0.85rem; color:#888; font-weight:normal;">(${item.product.company})</span>
                </div>
                <div class="cart-item-desc">${item.optionName}</div>
            </div>
            <div class="cart-item-right">
                <div class="cart-item-price">${item.totalPrice.toLocaleString()}원</div>
                <div class="cart-item-qty">${item.qty}개</div>
            </div>
            <button class="cart-delete-btn" onclick="deleteCartItem(${index})" title="삭제">&times;</button>
        `;
        cartList.appendChild(div);
    });
    if(totalEl) totalEl.textContent = totalAmount.toLocaleString() + "원";
    if(countEl) countEl.textContent = cartItems.length;
}

window.deleteCartItem = function(index) {
    const card = document.querySelectorAll('.cart-item-card')[index];
    deletedItemBackup = { item: cartItems[index], optionId: cartItems[index].optionId };
    if(card) card.classList.add('deleting');
    setTimeout(() => { cartItems.splice(index, 1); renderCart(); showUndoNotification(); }, 200);
};

function showUndoNotification() {
    const undoArea = document.getElementById('undo-area');
    undoArea.style.display = 'block';
    if(undoTimeout) clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => { undoArea.style.display = 'none'; deletedItemBackup = null; }, 5000);
}
if(document.getElementById('btn-undo')) document.getElementById('btn-undo').addEventListener('click', () => { if(deletedItemBackup) { cartItems.push(deletedItemBackup.item); renderCart(deletedItemBackup.optionId); document.getElementById('undo-area').style.display = 'none'; } });

// 주문 완료
if(document.getElementById('btn-order-complete')) {
    document.getElementById('btn-order-complete').addEventListener('click', async () => {
        if(cartItems.length === 0) return;
        if(!confirm(`총 ${cartItems.length}건 주문완료?`)) return;
        
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        try {
            await addDoc(collection(db, "order_history"), { date: dateStr, timestamp: now, items: cartItems });
            cartItems = []; renderCart();
        } catch(e) { console.error(e); alert("주문 저장 실패"); }
    });
}


/* ==========================================================================
   [7] 하단 로그 패널 (실시간 연동 & 취소 기능)
   ========================================================================== */
function subscribeToRecentLogs() {
    const logContainer = document.getElementById('completed-order-list');
    
    // 최근 50개만 가져오기
    const q = query(
        collection(db, "order_history"), 
        orderBy("timestamp", "desc"), 
        limit(50)
    );

    onSnapshot(q, (snapshot) => {
        logContainer.innerHTML = "";
        if(snapshot.empty) { logContainer.innerHTML = '<div style="color:#aaa; padding:10px;">최근 기록이 없습니다.</div>'; return; }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const dateObj = data.timestamp.toDate();
            const timeStr = `${dateObj.getMonth()+1}/${dateObj.getDate()} ${dateObj.getHours()}:${String(dateObj.getMinutes()).padStart(2,'0')}`;
            
            data.items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'log-item';
                div.innerHTML = `
                    <div style="display:flex; align-items:center;"><span class="log-time">[${timeStr}]</span><strong>${item.product.name}</strong><span style="color:#666; margin-left:5px;">(${item.qty})</span></div>
                    <div><span class="log-status">완료</span><button class="btn-log-restore">취소</button></div>
                `;
                div.querySelector('.btn-log-restore').addEventListener('click', async () => {
                    if(confirm("취소하시겠습니까?")) {
                        // 카트 복구 (내 화면만)
                        cartItems.push(item); renderCart(item.optionId);
                        // DB 삭제
                        await deleteDoc(doc(db, "order_history", docSnap.id)); 
                    }
                });
                logContainer.appendChild(div);
            });
        });
    });
}


/* ==========================================================================
   [8] 사진 업로드 및 대기열 (ON/OFF 시각적 처리)
   ========================================================================== */
const btnCamera = document.getElementById('btn-camera-floating');
const cameraInput = document.getElementById('camera-input');
const loadingSpinner = document.getElementById('loading-spinner');

if(btnCamera && cameraInput) {
    btnCamera.addEventListener('click', () => { cameraInput.click(); });

    cameraInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if(!file) return;

        // 압축 설정
        const options = { maxSizeMB: 1, maxWidthOrHeight: 1024, useWebWorker: true };

        try {
            if(loadingSpinner) loadingSpinner.style.display = 'flex';

            const compressedFile = await imageCompression(file, options);
            const storageRef = ref(storage, `photo_requests/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, compressedFile);
            const downloadURL = await getDownloadURL(storageRef);

            await addDoc(collection(db, "photo_requests"), {
                imageUrl: downloadURL,
                timestamp: new Date(),
                status: 'pending',
                note: ''
            });

            if(loadingSpinner) loadingSpinner.style.display = 'none';
            alert("사진 요청이 전송되었습니다!");

        } catch(error) {
            console.error("업로드 실패:", error);
            if(loadingSpinner) loadingSpinner.style.display = 'none';
            alert("업로드 중 오류가 발생했습니다.");
        }
    });
}

function subscribeToPhotoRequests() {
    const queueContainer = document.getElementById('photo-request-queue');
    if(!queueContainer) return;

    // 최근 72시간 이내 데이터
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const q = query(collection(db, "photo_requests"), where("timestamp", ">", threeDaysAgo), orderBy("timestamp", "desc"));

    onSnapshot(q, (snapshot) => {
        queueContainer.innerHTML = "";
        
        if(snapshot.empty) {
            queueContainer.style.display = "none"; 
            return;
        } else {
            queueContainer.style.display = "flex"; 
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const div = document.createElement('div');
            
            // 상태에 따른 클래스 추가
            div.className = `photo-queue-item ${data.status === 'processed' ? 'done' : 'pending'}`;
            div.innerHTML = `<img src="${data.imageUrl}">`;
            
            div.addEventListener('click', () => {
                showPhotoViewer(docSnap.id, data.imageUrl, data.status);
            });
            queueContainer.appendChild(div);
        });
    });
}

// 사진 뷰어 및 상태 토글
function showPhotoViewer(docId, imageUrl, currentStatus) {
    let viewer = document.getElementById('photo-viewer-modal');
    if(!viewer) {
        viewer = document.createElement('div');
        viewer.id = 'photo-viewer-modal';
        viewer.style.cssText = "display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:99999; align-items:center; justify-content:center; flex-direction:column;";
        viewer.innerHTML = `
            <div style="position:relative; max-width:90%; max-height:80%;">
                <img id="viewer-img" src="" style="max-width:100%; max-height:80vh; border-radius:8px;">
                <button id="viewer-close" style="position:absolute; top:-40px; right:0; background:none; border:none; color:white; font-size:2rem; cursor:pointer;">&times;</button>
            </div>
            <div style="margin-top:20px; display:flex; gap:10px;">
                <button id="btn-toggle-status" style="padding:15px 30px; font-size:1.2rem; border-radius:30px; border:none; cursor:pointer; font-weight:bold; box-shadow:0 4px 10px rgba(0,0,0,0.3);"></button>
            </div>
        `;
        document.body.appendChild(viewer);
        
        viewer.querySelector('#viewer-close').onclick = () => viewer.style.display = 'none';
        viewer.onclick = (e) => { if(e.target === viewer) viewer.style.display = 'none'; };
    }

    const img = viewer.querySelector('#viewer-img');
    const btn = viewer.querySelector('#btn-toggle-status');
    
    img.src = imageUrl;
    
    if(currentStatus === 'pending') {
        btn.textContent = "처리 완료 (OFF)";
        btn.style.backgroundColor = "#e74c3c";
        btn.style.color = "white";
    } else {
        btn.textContent = "다시 활성화 (ON)";
        btn.style.backgroundColor = "#27ae60"; 
        btn.style.color = "white";
    }

    btn.onclick = async () => {
        const newStatus = currentStatus === 'pending' ? 'processed' : 'pending';
        try {
            await updateDoc(doc(db, "photo_requests", docId), { status: newStatus });
            viewer.style.display = 'none'; 
        } catch(e) { alert("상태 변경 실패"); }
    };

    viewer.style.display = 'flex';
}


/* ==========================================================================
   [9] 상품 관리(Admin)
   ========================================================================== */
function renderAdminList(productsToRender) {
    const adminListContainer = document.getElementById('admin-product-list');
    const countEl = document.getElementById('admin-list-count');
    if(!adminListContainer) return;

    adminListContainer.innerHTML = ""; 
    if(countEl) countEl.textContent = `(${productsToRender.length}개)`;

    if(productsToRender.length === 0) {
        adminListContainer.innerHTML = "<li style='padding:20px; text-align:center; color:#ccc;'>검색 결과가 없습니다.</li>";
        return;
    }

    productsToRender.sort((a, b) => a.name.localeCompare(b.name));

    productsToRender.forEach(item => {
        const li = document.createElement("li");
        li.style.padding = "15px"; li.style.borderBottom = "1px solid #eee"; li.style.display = "flex"; li.style.justifyContent = "space-between"; li.style.alignItems = "flex-start";

        let optionsHtml = "";
        if(item.options && item.options.length > 0) {
            optionsHtml = item.options.map(opt => `<span class="admin-option-tag">#${opt.name}</span>`).join("");
        } else {
            optionsHtml = `<span style="font-size:0.75rem; color:#ccc;">옵션 없음</span>`;
        }

        li.innerHTML = `
            <div style="flex:1;">
                <div style="font-weight:bold; color:#333; margin-bottom:5px;">
                    <span style="color:#2980b9;">[${item.category}]</span> 
                    <span style="color:#aaa;">/</span> ${item.company} 
                    <span style="color:#aaa;">/</span> <span style="font-size:1.05rem;">${item.name}</span>
                </div>
                <div style="line-height:1.5;">${optionsHtml}</div>
            </div>
            <div style="display:flex; gap:5px; margin-left:10px;">
                <button class="btn-edit-product" style="background:#f39c12; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">수정</button>
                <button class="btn-real-delete" data-id="${item.id}" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">삭제</button>
            </div>
        `;
        
        li.querySelector('.btn-edit-product').addEventListener('click', () => {
            document.querySelector('.menu-item[data-target="product-mgmt"]').click();
            startEditMode(item); 
        });
        adminListContainer.appendChild(li);
    });

    document.querySelectorAll('.btn-real-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if(confirm("이 상품을 영구 삭제하시겠습니까?")) {
                await deleteDoc(doc(db, "products", e.target.getAttribute('data-id')));
                loadProducts(); 
            }
        });
    });
}

const adminSearchInput = document.getElementById('admin-product-search');
if(adminSearchInput) {
    adminSearchInput.addEventListener('input', (e) => {
        const keyword = e.target.value.toLowerCase();
        const filtered = allProductsData.filter(p => 
            p.name.toLowerCase().includes(keyword) || 
            p.company.toLowerCase().includes(keyword) ||
            p.category.toLowerCase().includes(keyword)
        );
        renderAdminList(filtered);
    });
}

function startEditMode(item) {
    editingProductId = item.id; 
    document.getElementById('reg-category').value = item.category;
    document.getElementById('reg-company').value = item.company;
    document.getElementById('reg-name').value = item.name;
    const container = document.getElementById('reg-options-container');
    container.innerHTML = ""; 
    if(item.options && item.options.length > 0) {
        item.options.forEach(opt => addOptionRow(opt.name, opt.price));
    } else {
        addOptionRow(); 
    }
    const btnReg = document.getElementById('btn-register');
    btnReg.textContent = "상품 수정완료";
    btnReg.style.backgroundColor = "#f39c12"; 
    document.getElementById('product-form-body').scrollTop = 0;
}

const btnRegister = document.getElementById('btn-register');
if(btnRegister) {
    btnRegister.addEventListener('click', async () => {
        const cat = document.getElementById('reg-category').value;
        const comp = document.getElementById('reg-company').value;
        const name = document.getElementById('reg-name').value;
        const stock = true; 

        if(!cat || !comp || !name) { alert("기본 정보를 입력해주세요."); return; }

        const optionRows = document.querySelectorAll('.option-input-row');
        const options = [];
        
        optionRows.forEach(row => {
            const optName = row.querySelector('.opt-name').value;
            const rawPrice = row.querySelector('.opt-price').value.replace(/,/g, '');
            const optPrice = Number(rawPrice);
            if(optName && optPrice) {
                options.push({
                    id: Date.now() + Math.random().toString(36).substr(2, 5), 
                    name: optName, price: optPrice, count: 1 
                });
            }
        });

        if(options.length === 0) { alert("적어도 하나의 옵션을 입력해주세요."); return; }

        const productData = {
            category: cat, company: comp, name: name, stock: stock,
            options: options, code: Date.now().toString()
        };

        try {
            if(editingProductId) {
                await updateDoc(doc(db, "products", editingProductId), productData);
                alert("상품이 수정되었습니다.");
                editingProductId = null; 
                btnRegister.textContent = "상품 등록하기";
                btnRegister.style.backgroundColor = "#27ae60"; 
            } else {
                await addDoc(collection(db, "products"), productData);
                alert("상품이 등록되었습니다!");
            }
            document.getElementById('reg-name').value = "";
            document.getElementById('reg-options-container').innerHTML = "";
            addOptionRow(); 
            loadProducts(); 
        } catch(e) { console.error("저장 실패:", e); }
    });
}

async function loadSupplierDropdown() {
    const select = document.getElementById('reg-company');
    if(!select) return;
    try {
        const supSnapshot = await getDocs(collection(db, "suppliers"));
        let optionsHtml = '<option value="">거래처를 선택하세요</option>';
        supSnapshot.forEach(doc => {
            const data = doc.data();
            optionsHtml += `<option value="${data.name}">${data.name}</option>`;
        });
        select.innerHTML = optionsHtml;
    } catch(e) { console.error(e); }
}

window.addOptionRow = function(name="", price="") {
    const container = document.getElementById('reg-options-container');
    const div = document.createElement('div');
    div.className = 'option-input-row';
    let displayPrice = price ? Number(price).toLocaleString() : "";
    div.innerHTML = `
        <input type="text" class="opt-name" placeholder="옵션명 (예: 1박스)" value="${name}" style="flex:2;">
        <input type="text" class="opt-price" placeholder="가격 (숫자)" value="${displayPrice}" style="flex:1;">
        <button class="btn-remove-row" onclick="this.parentElement.remove()" title="행 삭제">-</button>
    `;
    const priceInput = div.querySelector('.opt-price');
    priceInput.addEventListener('input', function(e) {
        let val = e.target.value.replace(/[^0-9]/g, '');
        if(val) { e.target.value = Number(val).toLocaleString(); } else { e.target.value = ""; }
    });
    container.appendChild(div);
};
const btnAddRow = document.getElementById('btn-add-option-row');
if(btnAddRow) btnAddRow.addEventListener('click', () => addOptionRow());


/* ==========================================================================
   [10] 달력 및 기록 조회
   ========================================================================== */
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthEl = document.getElementById('cal-current-month');
    if(!grid) return;
    grid.innerHTML = "";
    const year = calDate.getFullYear();
    const month = calDate.getMonth(); 
    monthEl.textContent = `${year}.${String(month + 1).padStart(2, '0')}`;
    const firstDay = new Date(year, month, 1).getDay(); 
    const lastDate = new Date(year, month + 1, 0).getDate(); 
    const today = new Date();
    const isThisMonth = (today.getFullYear() === year && today.getMonth() === month);
    for(let i=0; i<firstDay; i++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'calendar-date empty';
        grid.appendChild(emptyDiv);
    }
    for(let i=1; i<=lastDate; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-date';
        dayDiv.textContent = i;
        const dateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        dayDiv.setAttribute('data-date', dateStr);
        if(isThisMonth && today.getDate() === i) dayDiv.classList.add('today');
        if(selectedDateStr === dateStr) dayDiv.classList.add('selected');
        dayDiv.addEventListener('click', () => {
            document.querySelectorAll('.calendar-date.selected').forEach(d => d.classList.remove('selected'));
            dayDiv.classList.add('selected');
            selectedDateStr = dateStr;
            loadHistoryByDate(dateStr);
        });
        grid.appendChild(dayDiv);
    }
}
const btnCalPrev = document.getElementById('cal-prev');
const btnCalNext = document.getElementById('cal-next');
if(btnCalPrev) btnCalPrev.addEventListener('click', () => { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); });
if(btnCalNext) btnCalNext.addEventListener('click', () => { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); });

async function loadHistoryByDate(dateStr) {
    const listContainer = document.getElementById('history-list');
    const titleEl = document.getElementById('history-title');
    titleEl.textContent = `${dateStr} 주문 상세 내역`;
    listContainer.innerHTML = "<div style='text-align:center; margin-top:50px;'>로딩중...</div>";
    try {
        const q = query(collection(db, "order_history"), where("date", "==", dateStr));
        const querySnapshot = await getDocs(q);
        listContainer.innerHTML = "";
        if(querySnapshot.empty) { listContainer.innerHTML = "<div style='text-align:center; color:#ccc; margin-top:50px;'>기록 없음</div>"; return; }
        
        let historyData = [];
        querySnapshot.forEach(doc => historyData.push({ id: doc.id, ...doc.data() }));
        historyData.sort((a, b) => b.timestamp.seconds - a.timestamp.seconds);

        historyData.forEach(data => {
            const items = data.items; 
            const card = document.createElement('div');
            card.className = 'history-card';
            const dateObj = data.timestamp.toDate(); 
            const timeStr = `${dateObj.getHours()}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
            let itemsHtml = "";
            items.forEach(item => {
                itemsHtml += `<div class="history-item-row"><span>${item.product.name} <span style="color:#666;">(${item.optionName})</span></span><strong>${item.qty}개</strong></div>`;
            });
            card.innerHTML = `<div class="history-time">⏰ ${timeStr} (총 ${items.length}품목)</div><div style="border-top:1px solid #eee; margin-top:5px; padding-top:5px;">${itemsHtml}</div>`;
            listContainer.appendChild(card);
        });
    } catch (e) { console.error(e); }
}


/* ==========================================================================
   [11] 기타 거래처/메뉴/초기화 (필수)
   ========================================================================== */
window.triggerTagAction = function(productId) {
    document.querySelector('.menu-item[data-target="order-mgmt"]').click();
    setTimeout(() => {
        const targetNode = document.querySelector(`.tree-node[data-id="${productId}"]`);
        if(targetNode) targetNode.click();
    }, 100);
};

function fillSupplierForm(sup) {
    currentSupplierId = sup.id;
    document.getElementById('supplier-form-title').textContent = `${sup.name} 수정`;
    document.getElementById('sup-name').value = sup.name || "";
    document.getElementById('sup-website').value = sup.website || "";
    document.getElementById('sup-site-id').value = sup.siteId || "";
    document.getElementById('sup-site-pw').value = sup.sitePw || "";
    document.getElementById('sup-site-pw').type = "password";
    document.getElementById('sup-cur-manager').value = sup.curManagerName || "";
    document.getElementById('sup-cur-phone').value = sup.curManagerPhone || "";
    document.getElementById('sup-prev-manager').value = sup.prevManagerName || "";
    document.getElementById('sup-prev-phone').value = sup.prevManagerPhone || "";
}

const btnNewSupplier = document.getElementById('btn-new-supplier');
if(btnNewSupplier) btnNewSupplier.addEventListener('click', () => {
    currentSupplierId = null;
    document.getElementById('supplier-form-title').textContent = "신규 등록";
    document.querySelectorAll('input[id^="sup-"]').forEach(input => input.value = "");
    document.getElementById('sup-name').focus();
});

const btnSaveSupplier = document.getElementById('btn-save-supplier');
if(btnSaveSupplier) btnSaveSupplier.addEventListener('click', async () => {
    const name = document.getElementById('sup-name').value;
    if(!name) { alert("거래처명 필수"); return; }
    const data = {
        name: name, website: document.getElementById('sup-website').value,
        siteId: document.getElementById('sup-site-id').value, sitePw: document.getElementById('sup-site-pw').value,
        curManagerName: document.getElementById('sup-cur-manager').value, curManagerPhone: document.getElementById('sup-cur-phone').value,
        prevManagerName: document.getElementById('sup-prev-manager').value, prevManagerPhone: document.getElementById('sup-prev-phone').value
    };
    if(currentSupplierId) await deleteDoc(doc(db, "suppliers", currentSupplierId));
    await addDoc(collection(db, "suppliers"), data);
    alert("저장완료"); loadSuppliers(); btnNewSupplier.click();
});

const btnDeleteSupplier = document.getElementById('btn-delete-supplier');
if(btnDeleteSupplier) btnDeleteSupplier.addEventListener('click', async () => {
    if(currentSupplierId && confirm("삭제하시겠습니까?")) {
        await deleteDoc(doc(db, "suppliers", currentSupplierId));
        alert("삭제됨"); loadSuppliers(); btnNewSupplier.click();
    }
});

document.getElementById('btn-toggle-pw').addEventListener('click', () => {
    const pwInput = document.getElementById('sup-site-pw');
    if(pwInput.type === "password") {
        const pin = prompt("PIN 입력 (초기값: 0000)");
        if(pin === "0000") pwInput.type = "text"; else alert("불일치");
    } else pwInput.type = "password";
});

document.getElementById('btn-manager-handover').addEventListener('click', () => {
    const curName = document.getElementById('sup-cur-manager').value;
    const curPhone = document.getElementById('sup-cur-phone').value;
    if(!curName) return;
    if(confirm("이관하시겠습니까?")) {
        document.getElementById('sup-prev-manager').value = curName;
        document.getElementById('sup-prev-phone').value = curPhone;
        document.getElementById('sup-cur-manager').value = "";
        document.getElementById('sup-cur-phone').value = "";
    }
});

const toggleBtn = document.getElementById('toggle-btn');
const bottomPanel = document.querySelector('.bottom-panel');
if(toggleBtn) toggleBtn.addEventListener('click', () => { bottomPanel.classList.toggle('collapsed'); toggleBtn.textContent = bottomPanel.classList.contains('collapsed') ? '▲' : '▼'; });

const btnInfo = document.getElementById('btn-show-info-small');
if(btnInfo) btnInfo.addEventListener('click', () => { const modal = document.getElementById('info-modal'); modal.style.display = 'flex'; });
document.getElementById('btn-close-modal').addEventListener('click', () => document.getElementById('info-modal').style.display = 'none');
document.getElementById('btn-close-modal-bottom').addEventListener('click', () => document.getElementById('info-modal').style.display = 'none');

const menuItems = document.querySelectorAll('.menu-item');
const pages = document.querySelectorAll('.content-group');
menuItems.forEach(item => {
    item.addEventListener('click', () => {
        menuItems.forEach(menu => menu.classList.remove('active'));
        item.classList.add('active');
        const targetId = item.getAttribute('data-target');
        pages.forEach(page => page.style.display = 'none');
        const targetPage = document.getElementById(`page-${targetId}`);
        if (targetPage) {
            const isFlexPage = ['product-mgmt', 'history-mgmt', 'order-mgmt', 'supplier-mgmt'].includes(targetId);
            targetPage.style.display = isFlexPage ? 'flex' : 'block';
            if(['product-mgmt', 'history-mgmt', 'supplier-mgmt'].includes(targetId)) targetPage.style.flexDirection = 'column';
        }
        
        if(targetId === 'supplier-mgmt') loadSuppliers(); 
        if(targetId === 'history-mgmt') { 
            calDate = new Date(); 
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            const todayStr = `${y}-${m}-${d}`;
            selectedDateStr = todayStr;
            renderCalendar();
            loadHistoryByDate(todayStr); 
        }
        if(targetId === 'product-mgmt') {
            loadSupplierDropdown(); 
            if(!editingProductId) {
                if(document.getElementById('reg-options-container').children.length === 0) addOptionRow();
            }
        }
        window.scrollTo(0, 0); 
    });
});

// [12] 초기 실행
loadProducts();
subscribeToRecentLogs();
subscribeToPhotoRequests();