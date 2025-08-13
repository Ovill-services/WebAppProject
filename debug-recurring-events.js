// Debug script to test recurring event functionality
console.log("Testing recurring events functionality...");

// Test 1: Check if modal exists in DOM
function testModalExists() {
    const modal = document.getElementById('recurringEditPromptModal');
    console.log('Modal exists:', !!modal);
    return !!modal;
}

// Test 2: Check if functions are defined
function testFunctionsExist() {
    console.log('editEventFromView exists:', typeof window.editEventFromView === 'function');
    console.log('showDeleteRecurringPrompt exists:', typeof window.showDeleteRecurringPrompt === 'function');
    console.log('deleteEventFromView exists:', typeof window.deleteEventFromView === 'function');
}

// Test 3: Try to open the modal manually
function testModalOpen() {
    try {
        const modal = new bootstrap.Modal(document.getElementById('recurringEditPromptModal'));
        modal.show();
        console.log('Modal opened successfully');
        setTimeout(() => modal.hide(), 2000);
    } catch (error) {
        console.error('Error opening modal:', error);
    }
}

// Run tests when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            testModalExists();
            testFunctionsExist();
            testModalOpen();
        }, 1000);
    });
} else {
    setTimeout(() => {
        testModalExists();
        testFunctionsExist();
        testModalOpen();
    }, 1000);
}
