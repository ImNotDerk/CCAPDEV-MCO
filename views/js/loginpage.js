$(document).ready(function() {
    const $registrationForm = $('.registration-form');
    const $resetForm = $('.reset-password-form');
    const $idInput = $('#idNumber');
    const $idFeedback = $('#idFeedback');
    const $passwordInput = $('#password');
    const $passwordConfirmInput = $('#password2');
    const $securityQuestion = $('#securityQuestion');
    const $securityAnswer = $('#securityAnswer');

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

    const registrationMessageData = document.getElementById('registration-message-data');
    if (registrationMessageData) {
        const serverError = registrationMessageData.dataset.error;
        const serverErrorDetails = registrationMessageData.dataset.errorDetails;
        const serverSuccess = registrationMessageData.dataset.success;

        if (serverError) {
            const errorMessage = serverErrorDetails || 'Registration failed. Please review your inputs.';
            showErrorPopup(errorMessage);
            $('.registration-form').show();
            $('.login-form').hide();
        } else if (serverSuccess) {
            showSuccessPopup(serverSuccess);
            $('.login-form').show();
            $('.registration-form').hide();
        }
    }

    // Password validation on input
    $('#password').on('input focus', function() {
        const password = $(this).val();
        if (password.length > 0 || $(this).is(':focus')) {
            $('#passwordRequirements').addClass('show');
        }
        validatePassword(password);
        updateFormActionButtons();
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
        updateFormActionButtons();
    });

    // ID validation
    $idInput.on('input', function() {
        const validation = validateIdField($(this).val());
        updateIdFeedback(validation);
        updateFormActionButtons();
    });

    // Track other inputs
    $('#fname, #lname, #email').on('input', updateFormActionButtons);
    $securityQuestion.on('change', updateFormActionButtons);
    $securityAnswer.on('input', updateFormActionButtons);

    // Initialize button state
    updateIdFeedback(validateIdField($idInput.val()));
    updateFormActionButtons();

    // Form submission validation
    $registrationForm.on('submit', function(e) {
        const password = $('#password').val();
        const password2 = $('#password2').val();
        const idValidation = validateIdField($idInput.val());
        
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

        if (!idValidation.isValid) {
            e.preventDefault();
            showErrorPopup(idValidation.message || 'Please provide a valid ID number.');
            return false;
        }
    });

    $resetForm.on('submit', function(e) {
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
        maxLength: password.length <= 50 && password.length > 0,
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
    updateRequirement('req-maxlength', requirements.maxLength);

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
           password.length <= 50 &&
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

function normalizeIdValue(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, '').trim();
}

function validateIdField(value) {
    const normalized = normalizeIdValue(value);

    if (!normalized) {
        return { isValid: false, message: 'ID number is required' };
    }

    if (!/^\d+$/.test(normalized)) {
        return { isValid: false, message: 'ID number must contain digits only' };
    }

    if (normalized.length !== 8) {
        return { isValid: false, message: 'ID number must be exactly 8 digits' };
    }

    let sum = 0;
    for (let i = 0; i < normalized.length; i++) {
        const digit = parseInt(normalized.charAt(i), 10);
        const position = normalized.length - i;
        sum += digit * position;
    }

    if (sum % 11 !== 0) {
        return { isValid: false, message: 'ID number failed the checksum validation' };
    }

    return { isValid: true, message: 'ID number looks good!' };
}

function updateIdFeedback(validation) {
    const $feedback = $('#idFeedback');

    if (!validation || !validation.message) {
        $feedback.text('').removeClass('error success');
        return;
    }

    $feedback
        .text(validation.message)
        .toggleClass('error', !validation.isValid)
        .toggleClass('success', validation.isValid);
}

function updateFormActionButtons() {
    const $createBtn = $('#createAccountBtn');
    const $resetBtn = $('#resetPasswordBtn');

    if ($createBtn.length) {
        const registrationReady = isRegistrationFormValid();
        $createBtn.prop('disabled', !registrationReady).toggleClass('btn-disabled', !registrationReady);
    }

    if ($resetBtn.length) {
        const resetReady = isResetFormValid();
        $resetBtn.prop('disabled', !resetReady).toggleClass('btn-disabled', !resetReady);
    }
}

function isRegistrationFormValid() {
    const firstNameValid = $('#fname').val().trim().length > 0;
    const lastNameValid = $('#lname').val().trim().length > 0;
    const emailInput = document.getElementById('email');
    const emailValid = emailInput ? emailInput.checkValidity() : false;
    const password = $('#password').val();
    const passwordConfirm = $('#password2').val();
    const passwordValid = validatePasswordComplete(password);
    const passwordsMatch = password.length > 0 && password === passwordConfirm;
    const securityQuestionSelected = $('#securityQuestion').val() && $('#securityQuestion').val().length > 0;
    const securityAnswerValid = $('#securityAnswer').val().trim().length > 0 && $('#securityAnswer').val().trim().length <= 100;
    const idValidation = validateIdField($('#idNumber').val());

    return firstNameValid &&
        lastNameValid &&
        emailValid &&
        passwordValid &&
        passwordsMatch &&
        securityQuestionSelected &&
        securityAnswerValid &&
        idValidation.isValid;
}

function isResetFormValid() {
    const password = $('#password').val();
    const passwordConfirm = $('#password2').val();
    return password.length > 0 &&
        validatePasswordComplete(password) &&
        password === passwordConfirm;
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