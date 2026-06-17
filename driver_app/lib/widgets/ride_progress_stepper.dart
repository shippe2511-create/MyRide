import 'package:flutter/material.dart';

enum RideStep {
  accepted,
  enRoutePickup,
  arrivedPickup,
  inProgress,
  completed,
}

class RideProgressStepper extends StatelessWidget {
  final RideStep currentStep;
  final Color activeColor;
  final Color inactiveColor;

  const RideProgressStepper({
    super.key,
    required this.currentStep,
    this.activeColor = const Color(0xFFFFD60A),
    this.inactiveColor = const Color(0xFF3A3A3A),
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              _StepDot(
                isActive: currentStep.index >= RideStep.accepted.index,
                isCompleted: currentStep.index > RideStep.accepted.index,
                activeColor: activeColor,
                inactiveColor: inactiveColor,
              ),
              _StepLine(
                isActive: currentStep.index > RideStep.accepted.index,
                activeColor: activeColor,
                inactiveColor: inactiveColor,
              ),
              _StepDot(
                isActive: currentStep.index >= RideStep.enRoutePickup.index,
                isCompleted: currentStep.index > RideStep.enRoutePickup.index,
                activeColor: activeColor,
                inactiveColor: inactiveColor,
              ),
              _StepLine(
                isActive: currentStep.index > RideStep.enRoutePickup.index,
                activeColor: activeColor,
                inactiveColor: inactiveColor,
              ),
              _StepDot(
                isActive: currentStep.index >= RideStep.arrivedPickup.index,
                isCompleted: currentStep.index > RideStep.arrivedPickup.index,
                activeColor: activeColor,
                inactiveColor: inactiveColor,
              ),
              _StepLine(
                isActive: currentStep.index > RideStep.arrivedPickup.index,
                activeColor: activeColor,
                inactiveColor: inactiveColor,
              ),
              _StepDot(
                isActive: currentStep.index >= RideStep.inProgress.index,
                isCompleted: currentStep.index > RideStep.inProgress.index,
                activeColor: activeColor,
                inactiveColor: inactiveColor,
              ),
              _StepLine(
                isActive: currentStep.index > RideStep.inProgress.index,
                activeColor: activeColor,
                inactiveColor: inactiveColor,
              ),
              _StepDot(
                isActive: currentStep.index >= RideStep.completed.index,
                isCompleted: currentStep == RideStep.completed,
                activeColor: Colors.green,
                inactiveColor: inactiveColor,
                icon: Icons.check,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _StepLabel(
                label: 'Accepted',
                isActive: currentStep.index >= RideStep.accepted.index,
              ),
              _StepLabel(
                label: 'En Route',
                isActive: currentStep.index >= RideStep.enRoutePickup.index,
              ),
              _StepLabel(
                label: 'Arrived',
                isActive: currentStep.index >= RideStep.arrivedPickup.index,
              ),
              _StepLabel(
                label: 'In Trip',
                isActive: currentStep.index >= RideStep.inProgress.index,
              ),
              _StepLabel(
                label: 'Done',
                isActive: currentStep.index >= RideStep.completed.index,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StepDot extends StatelessWidget {
  final bool isActive;
  final bool isCompleted;
  final Color activeColor;
  final Color inactiveColor;
  final IconData? icon;

  const _StepDot({
    required this.isActive,
    required this.isCompleted,
    required this.activeColor,
    required this.inactiveColor,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        color: isActive ? activeColor : inactiveColor,
        shape: BoxShape.circle,
        boxShadow: isActive
            ? [
                BoxShadow(
                  color: activeColor.withValues(alpha: 0.5),
                  blurRadius: 8,
                  spreadRadius: 1,
                ),
              ]
            : null,
      ),
      child: isCompleted || icon != null
          ? Icon(
              icon ?? Icons.check,
              color: Colors.black,
              size: 16,
            )
          : isActive
              ? Center(
                  child: Container(
                    width: 10,
                    height: 10,
                    decoration: const BoxDecoration(
                      color: Colors.black,
                      shape: BoxShape.circle,
                    ),
                  ),
                )
              : null,
    );
  }
}

class _StepLine extends StatelessWidget {
  final bool isActive;
  final Color activeColor;
  final Color inactiveColor;

  const _StepLine({
    required this.isActive,
    required this.activeColor,
    required this.inactiveColor,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        height: 3,
        margin: const EdgeInsets.symmetric(horizontal: 4),
        decoration: BoxDecoration(
          color: isActive ? activeColor : inactiveColor,
          borderRadius: BorderRadius.circular(1.5),
        ),
      ),
    );
  }
}

class _StepLabel extends StatelessWidget {
  final String label;
  final bool isActive;

  const _StepLabel({
    required this.label,
    required this.isActive,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 50,
      child: Text(
        label,
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 10,
          fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
          color: isActive ? Colors.white : Colors.white38,
        ),
      ),
    );
  }
}

class CompactRideProgress extends StatelessWidget {
  final RideStep currentStep;

  const CompactRideProgress({super.key, required this.currentStep});

  String get _stepText {
    switch (currentStep) {
      case RideStep.accepted:
        return 'Ride Accepted';
      case RideStep.enRoutePickup:
        return 'Heading to Pickup';
      case RideStep.arrivedPickup:
        return 'Arrived at Pickup';
      case RideStep.inProgress:
        return 'Trip in Progress';
      case RideStep.completed:
        return 'Trip Completed';
    }
  }

  IconData get _stepIcon {
    switch (currentStep) {
      case RideStep.accepted:
        return Icons.check_circle;
      case RideStep.enRoutePickup:
        return Icons.navigation;
      case RideStep.arrivedPickup:
        return Icons.place;
      case RideStep.inProgress:
        return Icons.directions_car;
      case RideStep.completed:
        return Icons.flag;
    }
  }

  Color get _stepColor {
    switch (currentStep) {
      case RideStep.completed:
        return Colors.green;
      default:
        return const Color(0xFFFFD60A);
    }
  }

  @override
  Widget build(BuildContext context) {
    final progress = (currentStep.index + 1) / RideStep.values.length;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: _stepColor.withValues(alpha: 0.2),
                  shape: BoxShape.circle,
                ),
                child: Icon(_stepIcon, color: _stepColor, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _stepText,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Step ${currentStep.index + 1} of ${RideStep.values.length}',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.6),
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: Colors.white12,
              valueColor: AlwaysStoppedAnimation(_stepColor),
              minHeight: 6,
            ),
          ),
        ],
      ),
    );
  }
}
