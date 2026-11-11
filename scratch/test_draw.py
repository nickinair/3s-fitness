import matplotlib
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
import matplotlib.patches as patches

# Test font
font = FontProperties(fname='/System/Library/Fonts/STHeiti Medium.ttc')

fig, ax = plt.subplots(figsize=(10, 4), dpi=300)
ax.set_xlim(0, 10)
ax.set_ylim(0, 4)
ax.axis('off')

# Draw test box
box = patches.FancyBboxPatch((1, 1), 3, 2, boxstyle="round,pad=0.2",
                             fc='#1E3A8A', ec='#1E3A8A', lw=1.5)
ax.add_patch(box)
ax.text(2.5, 2, '3S-fitness 核心架构测试', fontproperties=font,
        color='white', fontsize=14, ha='center', va='center', weight='bold')

plt.savefig('/Users/nickni/Desktop/fitness-app/scratch/test_out.png', bbox_inches='tight')
print("Successfully generated test image")
