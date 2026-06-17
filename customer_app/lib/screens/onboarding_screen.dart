import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  final List<OnboardingPage> _pages = [
    OnboardingPage(
      icon: Icons.directions_car_rounded,
      title: 'Free Staff Transport',
      titleDv: 'ހިލޭ މުވައްޒަފުން އުފުލުން',
      description: 'Complimentary rides for all staff members. No charges, no hassle.',
      descriptionDv: 'ހުރިހާ މުވައްޒަފުންނަށް ހިލޭ ދަތުރުތައް. އެއްވެސް ޗާޖެއް ނެތް.',
    ),
    OnboardingPage(
      icon: Icons.schedule_rounded,
      title: 'Schedule Ahead',
      titleDv: 'ކުރިއާލާ ތާވަލުކުރޭ',
      description: 'Book rides in advance. Plan your commute and never miss a pickup.',
      descriptionDv: 'ކުރިއާލާ ދަތުރުތައް ބުކް ކުރޭ. ޕިކަޕް މިސް ނުވާނެ.',
    ),
    OnboardingPage(
      icon: Icons.location_on_rounded,
      title: 'Live Tracking',
      titleDv: 'ލައިވް ޓްރެކިންގ',
      description: 'Track your ride in real-time. Share your trip with family for safety.',
      descriptionDv: 'ރިއަލް-ޓައިމްގައި ދަތުރު ޓްރެކް ކުރޭ. އާއިލާއާ ޝެއާ ކުރޭ.',
    ),
    OnboardingPage(
      icon: Icons.face_rounded,
      title: 'Quick Login',
      titleDv: 'އަވަސް ލޮގިން',
      description: 'Use Face ID for instant access. Secure and convenient.',
      descriptionDv: 'ފޭސް އައިޑީ ބޭނުންކޮށް އަވަހަށް ވަދޭ. ރައްކާތެރި އަދި ފަސޭހަ.',
    ),
  ];

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _nextPage() {
    if (_currentPage < _pages.length - 1) {
      HapticFeedback.lightImpact();
      _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutCubic,
      );
    } else {
      _completeOnboarding();
    }
  }

  void _completeOnboarding() {
    HapticFeedback.mediumImpact();
    final appState = Provider.of<AppState>(context, listen: false);
    appState.completeOnboarding();
    Navigator.pushReplacementNamed(context, '/welcome');
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;
    final appState = Provider.of<AppState>(context);
    final isRtl = appState.currentLanguage == 'dv';

    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  GestureDetector(
                    onTap: () {
                      HapticFeedback.lightImpact();
                      appState.setCurrentLanguage(isRtl ? 'en' : 'dv');
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.language, color: context.mutedColor, size: 16),
                          const SizedBox(width: 6),
                          Text(
                            isRtl ? 'EN' : 'DV',
                            style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                  ),
                  GestureDetector(
                    onTap: _completeOnboarding,
                    child: Text(
                      isRtl ? 'ސްކިޕް' : 'Skip',
                      style: TextStyle(color: context.mutedColor, fontSize: 15, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                onPageChanged: (index) => setState(() => _currentPage = index),
                itemCount: _pages.length,
                itemBuilder: (context, index) {
                  final page = _pages[index];
                  return Directionality(
                    textDirection: isRtl ? TextDirection.rtl : TextDirection.ltr,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 32),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 120,
                            height: 120,
                            decoration: BoxDecoration(
                              color: AppColors.yellow,
                              borderRadius: BorderRadius.circular(32),
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.yellow.withValues(alpha: 0.3),
                                  blurRadius: 40,
                                  offset: const Offset(0, 16),
                                ),
                              ],
                            ),
                            child: Icon(page.icon, color: context.isDark ? AppColors.bgDark : Colors.white, size: 56),
                          ),
                          const SizedBox(height: 48),
                          Text(
                            isRtl ? page.titleDv : page.title,
                            style: TextStyle(
                              color: context.textColor,
                              fontSize: 28,
                              fontWeight: FontWeight.w700,
                              letterSpacing: -0.5,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            isRtl ? page.descriptionDv : page.description,
                            style: TextStyle(
                              color: context.mutedColor,
                              fontSize: 16,
                              height: 1.5,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(_pages.length, (index) {
                      final isActive = index == _currentPage;
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: isActive ? 24 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: isActive ? AppColors.yellow : (isDark ? Colors.white : Colors.black).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(4),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _nextPage,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.yellow,
                        foregroundColor: AppColors.bgDark,
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        elevation: 0,
                      ),
                      child: Text(
                        _currentPage == _pages.length - 1
                            ? (isRtl ? 'ފަށާ' : 'Get Started')
                            : (isRtl ? 'ކުރިއަށް' : 'Next'),
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class OnboardingPage {
  final IconData icon;
  final String title;
  final String titleDv;
  final String description;
  final String descriptionDv;

  OnboardingPage({
    required this.icon,
    required this.title,
    required this.titleDv,
    required this.description,
    required this.descriptionDv,
  });
}
