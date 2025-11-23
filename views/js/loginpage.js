$(document).ready(function() {
    $('.message a').click(function() {
    $('form').animate({height: "toggle", opacity: "toggle"}, "slow");
    });

    $('#reg-account-switch').click(function() {
        $('.registration-form').show();
        $('.login-form').hide();
    });

    $('#sign-in-switch').on('click', (function() {
        $('.login-form').show();
        $('.registration-form').hide();
    }));

    // Check for error parameter and show popup
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const errorDetails = urlParams.get('details');
    const success = urlParams.get('success');
    
    if (error === 'invalid') {
        showErrorPopup('Invalid username or password. Please try again.');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (error === 'server') {
        showErrorPopup('An error occurred. Please try again later.');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (error === 'session') {
        showErrorPopup('Your session has expired. Please log in again.');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (error === 'locked') {
        const details = errorDetails || 'Your account has been locked due to multiple failed login attempts.';
        showErrorPopup(details);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (error === 'password') {
        const message = errorDetails || 'Password does not meet complexity requirements.';
        showErrorPopup(message);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (error === 'registration') {
        const message = errorDetails || 'Registration failed. Please try again.';
        showErrorPopup(message);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (success === 'registered') {
        showSuccessPopup('Registration successful! You can now log in.');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Password validation on input
    $('#password').on('input focus', function() {
        const password = $(this).val();
        if (password.length > 0 || $(this).is(':focus')) {
            $('#passwordRequirements').addClass('show');
        }
        validatePassword(password);
    });

    $('#password').on('blur', function() {
        // Keep requirements visible if password has content
        if ($(this).val().length === 0) {
            $('#passwordRequirements').removeClass('show');
        }
    });

    // Password match validation
    $('#password2').on('input', function() {
        checkPasswordMatch();
    });

    // Form submission validation
    $('.registration-form').on('submit', function(e) {
        const password = $('#password').val();
        const password2 = $('#password2').val();
        
        if (!validatePasswordComplete(password)) {
            e.preventDefault();
            showErrorPopup('Please ensure your password meets all requirements.');
            return false;
        }
        
        if (password !== password2) {
            e.preventDefault();
            showErrorPopup('Passwords do not match. Please try again.');
            return false;
        }
    });
});

// Real-time password validation
function validatePassword(password) {
    const requirements = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };

    // Update visual indicators
    updateRequirement('req-length', requirements.length);
    updateRequirement('req-uppercase', requirements.uppercase);
    updateRequirement('req-lowercase', requirements.lowercase);
    updateRequirement('req-number', requirements.number);
    updateRequirement('req-special', requirements.special);

    return Object.values(requirements).every(req => req === true);
}

// Update individual requirement indicator
function updateRequirement(id, isValid) {
    const item = $('#' + id);
    const icon = item.find('.req-icon');
    
    if (isValid) {
        icon.text('✓').css('color', '#36C8A4');
        item.addClass('requirement-met');
    } else {
        icon.text('✗').css('color', '#ff4444');
        item.removeClass('requirement-met');
    }
}

// Check if password meets all requirements
function validatePasswordComplete(password) {
    return password.length >= 8 &&
           /[A-Z]/.test(password) &&
           /[a-z]/.test(password) &&
           /[0-9]/.test(password) &&
           /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
}

// Check if passwords match
function checkPasswordMatch() {
    const password = $('#password').val();
    const password2 = $('#password2').val();
    const matchMessage = $('#passwordMatchMessage');
    
    if (password2.length === 0) {
        matchMessage.text('').removeClass('match match-error');
        return;
    }
    
    if (password === password2) {
        matchMessage.text('✓ Passwords match').removeClass('match-error').addClass('match');
    } else {
        matchMessage.text('✗ Passwords do not match').removeClass('match').addClass('match-error');
    }
}

function showErrorPopup(message) {
    // Create popup overlay
    const popup = $('<div class="error-popup-overlay"></div>');
    const popupContent = $('<div class="error-popup-content"></div>');
    const popupMessage = $('<p class="error-popup-message"></p>').text(message);
    const closeBtn = $('<button class="error-popup-close">×</button>');
    
    popupContent.append(closeBtn);
    popupContent.append(popupMessage);
    popup.append(popupContent);
    
    $('body').append(popup);
    
    // Show popup with animation
    setTimeout(function() {
        popup.addClass('show');
    }, 10);
    
    // Close popup on button click
    closeBtn.on('click', function() {
        popup.removeClass('show');
        setTimeout(function() {
            popup.remove();
        }, 300);
    });
    
    // Close popup on overlay click
    popup.on('click', function(e) {
        if (e.target === popup[0]) {
            popup.removeClass('show');
            setTimeout(function() {
                popup.remove();
            }, 300);
        }
    });
    
    // Auto-close after 5 seconds
    setTimeout(function() {
        if (popup.hasClass('show')) {
            popup.removeClass('show');
            setTimeout(function() {
                popup.remove();
            }, 300);
        }
    }, 5000);
}

function showSuccessPopup(message) {
    // Create popup overlay with success styling
    const popup = $('<div class="error-popup-overlay"></div>');
    const popupContent = $('<div class="error-popup-content success-popup-content"></div>');
    const popupMessage = $('<p class="error-popup-message"></p>').text(message);
    const closeBtn = $('<button class="error-popup-close">×</button>');
    
    popupContent.append(closeBtn);
    popupContent.append(popupMessage);
    popup.append(popupContent);
    
    $('body').append(popup);
    
    // Show popup with animation
    setTimeout(function() {
        popup.addClass('show');
    }, 10);
    
    // Close popup on button click
    closeBtn.on('click', function() {
        popup.removeClass('show');
        setTimeout(function() {
            popup.remove();
        }, 300);
    });
    
    // Close popup on overlay click
    popup.on('click', function(e) {
        if (e.target === popup[0]) {
            popup.removeClass('show');
            setTimeout(function() {
                popup.remove();
            }, 300);
        }
    });
    
    // Auto-close after 5 seconds
    setTimeout(function() {
        if (popup.hasClass('show')) {
            popup.removeClass('show');
            setTimeout(function() {
                popup.remove();
            }, 300);
        }
    }, 5000);
}